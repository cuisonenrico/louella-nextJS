import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { UpdateProductionDto } from './dto/update-production.dto';
import { ProductionAnalyticsService } from './production-analytics.service';
import {
  dateKey,
  getConversionFactorMap,
  requireFactor,
} from '../common/utils/unit-conversion.util';

/** A production write, its material consumption and carry-forward, together. */
const WRITE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

type YieldKey = { branchId: number; productId: number; date: Date };
const yieldKey = (k: YieldKey) => `${k.branchId}:${k.productId}:${dateKey(k.date)}`;
import { assertDateRange, toUtcDay } from '../common/utils/date-range.util';
import {
  loadRecipeVersions,
  recipeOn,
} from '../common/utils/recipe-version.util';
import { recordChanges, type AuditEntry } from '../common/utils/audit.util';
import {
  lockMaterialChains,
  lockProductionKeys,
  reconcileMaterialChains,
} from '../common/utils/stock-chain';
import { num, q4 } from '../common/utils/decimal.util';

// Branch that owns production when an entry omits a branch. Materials are global
// (central kitchen), so this only affects which branch a yield is attributed to.
// Finalized production orders also book their yield here (addOrderYield).
export const PRODUCTION_BRANCH_ID = parseInt(
  process.env.PRODUCTION_BRANCH_ID ?? '1',
  10,
);

/** A production row's yield moving by `delta` from `from` (default 0). */
type YieldChange = { productId: number; date: Date; delta: number; from?: number };

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productionAnalytics: ProductionAnalyticsService,
  ) {}

  /**
   * Consume (or, for a negative delta, return) materials for yield changes,
   * inside the caller's transaction.
   *
   * The one place the consumption formula lives for single-row writes:
   *   used += Δyield × recipeItem.quantity × factor / recipeYield
   * computed as q4(new × rate) − q4(old × rate), where `from` is the row's
   * yield before the change. A row therefore always accounts for exactly
   * q4(yield × rate) of the card, however many edits it took to get there —
   * rounding each delta instead would drift (1 → 2 → 3 pieces at ⅓ kg books
   * 0.9999 kg, entering 3 at once books 1).
   * Recipes are read through `tx` too, so the recipe and the stock it moves
   * are seen consistently. Each change uses the recipe version in force on
   * its day; deleted recipes do not consume.
   */
  private async consumeMaterials(
    tx: Prisma.TransactionClient,
    changes: YieldChange[],
    userId?: number | null,
  ): Promise<void> {
    const moving = changes.filter((c) => c.delta !== 0);
    if (moving.length === 0) return;

    // The recipe in force on each change's own day: editing a recipe today
    // must not change what an edit to last week's production consumes. A
    // deleted (retired) recipe consumes nothing from its deletion day on.
    const versionsByProduct = await loadRecipeVersions(
      tx,
      moving.map((c) => c.productId),
    );
    const resolved = moving.map((change) => ({
      change,
      recipe: recipeOn(versionsByProduct.get(change.productId), change.date),
    }));

    const conversionMap = await getConversionFactorMap(
      tx,
      resolved.flatMap(({ recipe }) =>
        (recipe?.items ?? []).map((i) => ({ fromUnit: i.unit, toUnit: i.material.unit })),
      ),
    );

    // Sum per material and day first: two products sharing flour on one day
    // is one write, not two.
    const byCard = new Map<string, { materialId: number; date: Date; delta: number }>();
    for (const { change, recipe } of resolved) {
      if (!recipe) continue;
      for (const item of recipe.items) {
        const factor = requireFactor(
          conversionMap,
          item.unit,
          item.material.unit,
          item.material.name,
        );
        const rate = (num(item.quantity) * factor) / num(recipe.recipeYield);
        const from = change.from ?? 0;
        const delta = q4(q4((from + change.delta) * rate) - q4(from * rate));
        if (delta === 0) continue;
        const key = `${item.material.id}:${change.date.toISOString()}`;
        const entry = byCard.get(key);
        if (entry) entry.delta = q4(entry.delta + delta);
        else byCard.set(key, { materialId: item.material.id, date: change.date, delta });
      }
    }

    if (byCard.size === 0) return;
    await lockMaterialChains(
      tx,
      [...byCard.values()].map((c) => c.materialId),
    );
    const cardsBefore = await tx.materialInventory.findMany({
      where: {
        OR: [...byCard.values()].map((c) => ({ materialId: c.materialId, date: c.date })),
      },
    });
    const beforeByKey = new Map(
      cardsBefore.map((c) => [`${c.materialId}:${c.date.toISOString()}`, c]),
    );
    const audit: AuditEntry[] = [];
    for (const { materialId, date, delta } of byCard.values()) {
      const after = await tx.materialInventory.upsert({
        where: { materialId_date: { materialId, date } },
        // The unique key ignores deletedAt, so this can land on a deleted
        // card. Consumption that really happened must be visible, so writing
        // to a card revives it rather than recording into a hidden row.
        update: { used: { increment: delta }, deletedAt: null },
        create: { materialId, date, quantity: 0, delivery: 0, used: Math.max(0, delta) },
      });
      audit.push({
        entity: 'MaterialInventory',
        entityId: after.id,
        before: beforeByKey.get(`${materialId}:${date.toISOString()}`),
        after,
      });
    }
    await recordChanges(tx, audit, userId);
    // Consumption lowers the day's close; later cards open on it.
    await reconcileMaterialChains(
      tx,
      [...byCard.values()].map((c) => ({ materialId: c.materialId, fromDate: c.date })),
      { userId },
    );
  }

  /**
   * Add finalized production-order quantities to the kitchen's yield and
   * consume their materials, inside the caller's transaction.
   *
   * Adds rather than sets: several orders can cover one product on one day,
   * and the kitchen made all of them. Setting the yield let the last order
   * finalized overwrite the others — and never touched materials at all.
   */
  async addOrderYield(
    tx: Prisma.TransactionClient,
    date: Date,
    items: Array<{ productId: number; quantity: number }>,
    userId?: number,
  ): Promise<void> {
    const positive = items.filter((i) => i.quantity > 0);
    await lockProductionKeys(
      tx,
      positive.map((i) => ({ branchId: PRODUCTION_BRANCH_ID, productId: i.productId, date })),
    );
    const audit: AuditEntry[] = [];
    const startedFrom = new Map<number, number>();
    for (const item of positive) {
      const key = {
        branchId_productId_date: {
          branchId: PRODUCTION_BRANCH_ID,
          productId: item.productId,
          date,
        },
      };
      const before = await tx.production.findUnique({ where: key });
      startedFrom.set(item.productId, before && !before.deletedAt ? before.yield : 0);
      // A deleted row's yield was already handed back when it was deleted,
      // so a restore starts from this order's quantity, not from it.
      const after = await tx.production.upsert({
        where: key,
        update: before?.deletedAt
          ? { yield: item.quantity, isAutoGenerated: false, deletedAt: null, updatedById: userId ?? null }
          : { yield: { increment: item.quantity }, isAutoGenerated: false, updatedById: userId ?? null },
        create: {
          branchId: PRODUCTION_BRANCH_ID,
          productId: item.productId,
          date,
          yield: item.quantity,
          isAutoGenerated: false,
          createdById: userId,
        },
      });
      audit.push({
        entity: 'Production',
        entityId: after.id,
        before: before?.deletedAt ? null : before,
        after,
        action: !before ? 'create' : before.deletedAt ? 'restore' : 'update',
      });
    }
    await recordChanges(tx, audit, userId);
    await this.consumeMaterials(
      tx,
      positive.map((i) => ({
        productId: i.productId,
        date,
        delta: i.quantity,
        from: startedFrom.get(i.productId) ?? 0,
      })),
      userId,
    );
  }

  /**
   * Set yields and consume the materials for the change, atomically.
   *
   * Yield and delivery are tracked independently: the central kitchen may hold
   * stock back, batch ahead, or split a batch across branches.
   *
   * The old yield is read *inside* the transaction, after the production keys
   * are locked. It used to be read before, so two saves of the same product
   * and day both saw the old figure and both consumed the full difference.
   * The bulk paths also wrote yields and consumption in two separate
   * transactions, so a failure between them left materials permanently out of
   * step with production.
   */
  private saveYields(
    items: Array<YieldKey & { yield: number; notes?: string }>,
    userId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockProductionKeys(tx, items);

      // Deleted rows included: the unique key ignores deletedAt, so saving a
      // deleted day restores it. Its yield was handed back on delete, so it
      // counts as 0 here.
      const existing = items.length
        ? await tx.production.findMany({
            where: {
              OR: items.map((k) => ({ branchId: k.branchId, productId: k.productId, date: k.date })),
            },
          })
        : [];
      const existingByKey = new Map(existing.map((r) => [yieldKey(r), r]));
      // Updated as we go, so a key listed twice in one batch is charged once.
      const current = new Map(
        existing.map((r) => [yieldKey(r), r.deletedAt ? 0 : r.yield]),
      );

      const results = [];
      const audit: AuditEntry[] = [];
      const changes: YieldChange[] = [];
      for (const item of items) {
        const before = current.get(yieldKey(item)) ?? 0;
        const prior = existingByKey.get(yieldKey(item));
        const saved = await tx.production.upsert({
          where: {
            branchId_productId_date: {
              branchId: item.branchId,
              productId: item.productId,
              date: item.date,
            },
          },
          update: {
            yield: item.yield,
            notes: item.notes,
            deletedAt: null,
            updatedById: userId ?? null,
          },
          create: {
            branchId: item.branchId,
            productId: item.productId,
            date: item.date,
            yield: item.yield,
            notes: item.notes,
            createdById: userId,
          },
          include: { branch: true, product: true },
        });
        results.push(saved);
        audit.push({
          entity: 'Production',
          entityId: saved.id,
          before: prior?.deletedAt ? null : prior,
          after: saved,
          action: !prior ? 'create' : prior.deletedAt ? 'restore' : 'update',
        });
        changes.push({ productId: item.productId, date: item.date, delta: item.yield - before, from: before });
        current.set(yieldKey(item), item.yield);
        existingByKey.set(yieldKey(item), saved);
      }

      await recordChanges(tx, audit, userId);
      await this.consumeMaterials(tx, changes, userId);
      return results;
    }, WRITE_TX_OPTIONS);
  }

  async create(body: CreateProductionDto, userId?: number) {
    const [result] = await this.saveYields(
      [{ ...body, date: toUtcDay(body.date) }],
      userId,
    );
    return result;
  }

  createBulk(items: CreateProductionDto[], userId?: number) {
    return this.saveYields(
      items.map((item) => ({ ...item, date: toUtcDay(item.date) })),
      userId,
    );
  }

  /**
   * The production sheet's save: rows without a branch belong to the
   * production kitchen. Creates on first edit, updates after.
   */
  upsertBulk(
    items: Array<{ productId: number; date: string; yield: number; branchId?: number }>,
    userId?: number,
  ) {
    return this.saveYields(
      items.map((item) => ({
        branchId: item.branchId ?? PRODUCTION_BRANCH_ID,
        productId: item.productId,
        date: toUtcDay(item.date),
        yield: item.yield,
      })),
      userId,
    );
  }

  async findAll(page = 1, limit = 50, branchId?: number) {
    const skip = (page - 1) * limit;
    const where = { deletedAt: null, ...(branchId != null ? { branchId } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.production.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { branch: true, product: true },
      }),
      this.prisma.production.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByBranch(branchId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const where = { branchId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.production.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { product: true },
      }),
      this.prisma.production.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByProduct(
    productId: number,
    page = 1,
    limit = 50,
    branchId?: number,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      productId,
      deletedAt: null,
      ...(branchId != null ? { branchId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.production.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { branch: true },
      }),
      this.prisma.production.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findByDate(branchId: number, date: string) {
    return this.prisma.production.findMany({
      where: {
        branchId,
        date: toUtcDay(date),
        deletedAt: null,
      },
      orderBy: [
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
      include: { product: true },
    });
  }

  findByDateAllBranches(
    startDate?: string,
    endDate?: string,
    branchId?: number,
  ) {
    // No start date means today (Manila), not the whole table.
    const start = startDate ? toUtcDay(startDate) : toUtcDay(new Date());
    const end = endDate ? toUtcDay(endDate) : start;
    assertDateRange(start, end);
    const dateFilter =
      start.getTime() === end.getTime()
        ? { date: start }
        : { date: { gte: start, lte: end } };
    return this.prisma.production.findMany({
      where: {
        ...dateFilter,
        deletedAt: null,
        ...(branchId != null ? { branchId } : {}),
      },
      orderBy: [
        { branchId: 'asc' },
        { date: 'asc' },
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
      include: { branch: true, product: true },
    });
  }

  async findOne(id: number, branchId?: number) {
    const record = await this.prisma.production.findFirst({
      where: { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) },
      include: { branch: true, product: true },
    });
    if (!record) throw new NotFoundException('Production record not found');
    return record;
  }

  async getMaterialConsumption(
    id: number,
    plannedYield?: number,
    branchId?: number,
  ) {
    return this.productionAnalytics.getMaterialConsumption(
      id,
      plannedYield,
      branchId,
    );
  }

  async getMaterialConsumptionSummary(date: string, branchId?: number) {
    return this.productionAnalytics.getMaterialConsumptionSummary(
      date,
      branchId,
    );
  }

  async getEfficiency(startDate: string, endDate: string, branchId?: number) {
    return this.productionAnalytics.getEfficiency(startDate, endDate, branchId);
  }

  /**
   * Edit a production row, moving its material consumption with it.
   *
   * A change of product or date is a change of *what* was made and *when*:
   * the old product's materials on the old day are handed back and the new
   * one's charged on the new day. Previously only a yield change moved
   * materials, and only on the new key, so re-keying a row left the original
   * consumption in place. A clash with an existing row now surfaces as the
   * constraint error it is (409) instead of "not found".
   */
  async update(
    id: number,
    body: UpdateProductionDto,
    branchId?: number,
    userId?: number,
  ) {
    const old = await this.prisma.production.findFirst({
      where: { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) },
    });
    if (!old) throw new NotFoundException('Production record not found');

    const next: YieldKey = {
      branchId: body.branchId ?? old.branchId,
      productId: body.productId ?? old.productId,
      date: body.date ? toUtcDay(body.date) : old.date,
    };

    return this.prisma.$transaction(async (tx) => {
      await lockProductionKeys(tx, [old, next]);
      // Re-read under the lock: the yield to reverse is the one stored now.
      const locked = await tx.production.findUnique({ where: { id } });
      if (!locked || locked.deletedAt) {
        throw new NotFoundException('Production record not found');
      }

      const updated = await tx.production.update({
        where: { id },
        data: {
          branchId: body.branchId,
          productId: body.productId,
          date: body.date ? next.date : undefined,
          yield: body.yield,
          notes: body.notes,
          updatedById: userId ?? null,
        },
        include: { branch: true, product: true },
      });

      await recordChanges(
        tx,
        [{ entity: 'Production', entityId: id, before: locked, after: updated }],
        userId,
      );
      await this.consumeMaterials(
        tx,
        [
          { productId: locked.productId, date: locked.date, delta: -locked.yield, from: locked.yield },
          { productId: updated.productId, date: updated.date, delta: updated.yield },
        ],
        userId,
      );
      return updated;
    }, WRITE_TX_OPTIONS);
  }

  /**
   * Soft delete, like every operational table: the row stays (with who
   * deleted it, in the change history), its materials are handed back, and
   * saving the same day again restores it. This used to be a hard delete.
   */
  async remove(id: number, branchId?: number, userId?: number) {
    const rec = await this.prisma.production.findFirst({
      where: { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) },
    });
    if (!rec) throw new NotFoundException('Production record not found');
    return this.prisma.$transaction(async (tx) => {
      await lockProductionKeys(tx, [rec]);
      const locked = await tx.production.findUnique({ where: { id } });
      if (!locked || locked.deletedAt) {
        throw new NotFoundException('Production record not found');
      }
      const removed = await tx.production.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: userId ?? null },
      });
      await recordChanges(
        tx,
        // after: null, so the event shows what was removed (value → null).
        [{ entity: 'Production', entityId: id, before: locked, after: null, action: 'delete' }],
        userId,
      );
      await this.consumeMaterials(
        tx,
        [{ productId: locked.productId, date: locked.date, delta: -locked.yield, from: locked.yield }],
        userId,
      );
      return removed;
    }, WRITE_TX_OPTIONS);
  }

  /** Every recorded change to this production row, newest first. */
  async history(id: number, branchId?: number) {
    const row = await this.prisma.production.findFirst({
      where: { id, ...(branchId != null ? { branchId } : {}) },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Production record not found');
    return this.prisma.auditEvent.findMany({
      where: { entity: 'Production', entityId: id },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, email: true } } },
      take: 200,
    });
  }
}
