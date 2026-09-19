import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { toUtcDay } from '../common/utils/date-range.util';
import {
  loadRecipeVersions,
  recipeOn,
} from '../common/utils/recipe-version.util';
import {
  lockMaterialChains,
  lockProductionKeys,
  reconcileMaterialChains,
} from '../common/utils/stock-chain';

// Branch that owns production when an entry omits a branch. Materials are global
// (central kitchen), so this only affects which branch a yield is attributed to.
// Finalized production orders also book their yield here (addOrderYield).
export const PRODUCTION_BRANCH_ID = parseInt(
  process.env.PRODUCTION_BRANCH_ID ?? '1',
  10,
);

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
   * Recipes are read through `tx` too, so the recipe and the stock it moves
   * are seen consistently. Each change uses the recipe version in force on
   * its day; deleted recipes do not consume.
   */
  private async consumeMaterials(
    tx: Prisma.TransactionClient,
    changes: Array<{ productId: number; date: Date; delta: number }>,
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
        const delta =
          (change.delta * item.quantity * factor) / recipe.recipeYield;
        if (delta === 0) continue;
        const key = `${item.material.id}:${change.date.toISOString()}`;
        const entry = byCard.get(key);
        if (entry) entry.delta += delta;
        else byCard.set(key, { materialId: item.material.id, date: change.date, delta });
      }
    }

    await lockMaterialChains(
      tx,
      [...byCard.values()].map((c) => c.materialId),
    );
    for (const { materialId, date, delta } of byCard.values()) {
      await tx.materialInventory.upsert({
        where: { materialId_date: { materialId, date } },
        // The unique key ignores deletedAt, so this can land on a deleted
        // card. Consumption that really happened must be visible, so writing
        // to a card revives it rather than recording into a hidden row.
        update: { used: { increment: delta }, deletedAt: null },
        create: { materialId, date, quantity: 0, delivery: 0, used: Math.max(0, delta) },
      });
    }
    // Consumption lowers the day's close; later cards open on it.
    await reconcileMaterialChains(
      tx,
      [...byCard.values()].map((c) => ({ materialId: c.materialId, fromDate: c.date })),
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
    for (const item of positive) {
      await tx.production.upsert({
        where: {
          branchId_productId_date: {
            branchId: PRODUCTION_BRANCH_ID,
            productId: item.productId,
            date,
          },
        },
        update: { yield: { increment: item.quantity }, isAutoGenerated: false },
        create: {
          branchId: PRODUCTION_BRANCH_ID,
          productId: item.productId,
          date,
          yield: item.quantity,
          isAutoGenerated: false,
          createdById: userId,
        },
      });
    }
    await this.consumeMaterials(
      tx,
      positive.map((i) => ({ productId: i.productId, date, delta: i.quantity })),
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

      const existing = items.length
        ? await tx.production.findMany({
            where: {
              OR: items.map((k) => ({ branchId: k.branchId, productId: k.productId, date: k.date })),
            },
            select: { branchId: true, productId: true, date: true, yield: true },
          })
        : [];
      // Updated as we go, so a key listed twice in one batch is charged once.
      const current = new Map(existing.map((r) => [yieldKey(r), r.yield]));

      const results = [];
      const changes: Array<{ productId: number; date: Date; delta: number }> = [];
      for (const item of items) {
        const before = current.get(yieldKey(item)) ?? 0;
        results.push(
          await tx.production.upsert({
            where: {
              branchId_productId_date: {
                branchId: item.branchId,
                productId: item.productId,
                date: item.date,
              },
            },
            update: { yield: item.yield, notes: item.notes },
            create: {
              branchId: item.branchId,
              productId: item.productId,
              date: item.date,
              yield: item.yield,
              notes: item.notes,
              createdById: userId,
            },
            include: { branch: true, product: true },
          }),
        );
        changes.push({ productId: item.productId, date: item.date, delta: item.yield - before });
        current.set(yieldKey(item), item.yield);
      }

      await this.consumeMaterials(tx, changes);
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
    const where = branchId != null ? { branchId } : {};
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
    const where = { branchId };
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
    const where = { productId, ...(branchId != null ? { branchId } : {}) };
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
        date: new Date(date),
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
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : start;
    if (start && end) {
      const diffDays = Math.floor(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays < 0) {
        throw new BadRequestException('endDate must be on or after startDate');
      }
      if (diffDays > 30) {
        throw new BadRequestException('Date range cannot exceed 31 days');
      }
    }
    const dateFilter = start
      ? start.getTime() === end?.getTime()
        ? { date: start }
        : { date: { gte: start, lte: end } }
      : {};
    return this.prisma.production.findMany({
      where: { ...dateFilter, ...(branchId != null ? { branchId } : {}) },
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
      where: { id, ...(branchId != null ? { branchId } : {}) },
      include: { branch: true, product: true },
    });
    if (!record) throw new NotFoundException('Production record not found');
    return record;
  }

  async getMaterialConsumption(id: number, plannedYield?: number) {
    return this.productionAnalytics.getMaterialConsumption(id, plannedYield);
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
  async update(id: number, body: UpdateProductionDto, branchId?: number) {
    const old = await this.prisma.production.findFirst({
      where: { id, ...(branchId != null ? { branchId } : {}) },
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
      if (!locked) throw new NotFoundException('Production record not found');

      const updated = await tx.production.update({
        where: { id },
        data: {
          branchId: body.branchId,
          productId: body.productId,
          date: body.date ? next.date : undefined,
          yield: body.yield,
          notes: body.notes,
        },
        include: { branch: true, product: true },
      });

      await this.consumeMaterials(tx, [
        { productId: locked.productId, date: locked.date, delta: -locked.yield },
        { productId: updated.productId, date: updated.date, delta: updated.yield },
      ]);
      return updated;
    }, WRITE_TX_OPTIONS);
  }

  async remove(id: number, branchId?: number) {
    const rec = await this.prisma.production.findFirst({
      where: { id, ...(branchId != null ? { branchId } : {}) },
    });
    if (!rec) throw new NotFoundException('Production record not found');
    return this.prisma.$transaction(async (tx) => {
      await lockProductionKeys(tx, [rec]);
      const locked = await tx.production.findUnique({ where: { id } });
      if (!locked) throw new NotFoundException('Production record not found');
      await tx.production.delete({ where: { id } });
      await this.consumeMaterials(tx, [
        { productId: locked.productId, date: locked.date, delta: -locked.yield },
      ]);
      return locked;
    }, WRITE_TX_OPTIONS);
  }
}
