import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeasurementUnit, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductionDto } from './dto/create-production.dto';
import { UpdateProductionDto } from './dto/update-production.dto';
import { ProductionAnalyticsService } from './production-analytics.service';
import {
  dateKey,
  getConversionFactorMap,
  requireFactor,
} from '../common/utils/unit-conversion.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { reconcileMaterialChains } from '../common/utils/stock-chain';

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

  private buildCompositeWhere(
    keys: Array<{ branchId: number; productId: number; date: Date }>,
  ): Prisma.ProductionWhereInput[] {
    return keys.map((k) => ({
      branchId: k.branchId,
      productId: k.productId,
      date: k.date,
    }));
  }

  /**
   * Accumulates material consumption deltas for a set of changed production items.
   * Returns a map keyed by `materialId:dateISO` → { materialId, date, delta }.
   */
  private buildMaterialDeltaMap(
    changedItems: Array<{
      productId: number;
      yield: number;
      branchId?: number;
      date?: string;
    }>,
    dateObjs: Date[],
    existingMap: Map<string, number>,
    recipeByProduct: Map<
      number,
      {
        recipeYield: number;
        recipeItems: Array<{
          materialId: number;
          unit: MeasurementUnit;
          quantity: number;
          material: { id: number; name: string; unit: MeasurementUnit };
        }>;
      }
    >,
    conversionMap: Map<string, number>,
    defaultBranchId = PRODUCTION_BRANCH_ID,
  ): Map<string, { materialId: number; date: Date; delta: number }> {
    const deltaMap = new Map<
      string,
      { materialId: number; date: Date; delta: number }
    >();
    for (const item of changedItems) {
      // The old `dateObjs.indexOf(new Date(...))` never matched — indexOf
      // compares Dates by reference — so it always fell through to the same
      // value this line computes directly.
      const date = item.date ? toUtcDay(item.date) : dateObjs[0];
      const bId = (item as { branchId?: number }).branchId ?? defaultBranchId;
      const oldYield =
        existingMap.get(`${bId}:${item.productId}:${dateKey(date)}`) ?? 0;
      const recipe = recipeByProduct.get(item.productId);
      if (!recipe || recipe.recipeItems.length === 0) continue;
      for (const ri of recipe.recipeItems) {
        const factor = requireFactor(
          conversionMap,
          ri.unit,
          ri.material.unit,
          ri.material.name,
        );
        const delta =
          ((item.yield - oldYield) * ri.quantity * factor) / recipe.recipeYield;
        if (delta === 0) continue;
        const mapKey = `${ri.material.id}:${date.toISOString()}`;
        const entry = deltaMap.get(mapKey);
        if (entry) {
          entry.delta += delta;
        } else {
          deltaMap.set(mapKey, { materialId: ri.material.id, date, delta });
        }
      }
    }
    return deltaMap;
  }

  /** Runs all material inventory upserts derived from a delta map inside a single transaction. */
  private async applyMaterialDeltaUpserts(
    deltaMap: Map<string, { materialId: number; date: Date; delta: number }>,
  ): Promise<void> {
    if (deltaMap.size === 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const { materialId, date, delta } of deltaMap.values()) {
        await tx.materialInventory.upsert({
          where: { materialId_date: { materialId, date } },
          // The unique key ignores deletedAt, so this can land on a deleted
          // card. Consumption that really happened must be visible, so writing
          // to a card revives it rather than recording into a hidden row.
          update: { used: { increment: delta }, deletedAt: null },
          create: {
            materialId,
            date,
            quantity: 0,
            delivery: 0,
            used: Math.max(0, delta),
          },
        });
      }
      await reconcileMaterialChains(
        tx,
        [...deltaMap.values()].map((c) => ({ materialId: c.materialId, fromDate: c.date })),
      );
    });
  }

  /** Returns the old yield for an existing production record, or 0 if none exists. */
  private async findExistingYield(
    branchId: number,
    productId: number,
    date: Date,
  ): Promise<number> {
    const rec = await this.prisma.production.findUnique({
      where: { branchId_productId_date: { branchId, productId, date } },
    });
    return rec?.yield ?? 0;
  }

  /**
   * Consume (or, for a negative delta, return) materials for yield changes,
   * inside the caller's transaction.
   *
   * The one place the consumption formula lives for single-row writes:
   *   used += Δyield × recipeItem.quantity × factor / recipeYield
   * Recipes are read through `tx` too, so the recipe and the stock it moves
   * are seen consistently. Deleted recipes do not consume.
   */
  private async consumeMaterials(
    tx: Prisma.TransactionClient,
    changes: Array<{ productId: number; date: Date; delta: number }>,
  ): Promise<void> {
    const moving = changes.filter((c) => c.delta !== 0);
    if (moving.length === 0) return;

    const recipes = await tx.recipe.findMany({
      where: {
        productId: { in: [...new Set(moving.map((c) => c.productId))] },
        deletedAt: null,
      },
      include: { recipeItems: { include: { material: true } } },
    });
    const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));

    const conversionMap = await getConversionFactorMap(
      tx,
      recipes.flatMap((r) =>
        r.recipeItems.map((i) => ({ fromUnit: i.unit, toUnit: i.material.unit })),
      ),
    );

    // Sum per material and day first: two products sharing flour on one day
    // is one write, not two.
    const byCard = new Map<string, { materialId: number; date: Date; delta: number }>();
    for (const change of moving) {
      const recipe = recipeByProduct.get(change.productId);
      if (!recipe) continue;
      for (const item of recipe.recipeItems) {
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

    for (const { materialId, date, delta } of byCard.values()) {
      await tx.materialInventory.upsert({
        where: { materialId_date: { materialId, date } },
        // See applyMaterialDeltaUpserts: consumption revives a deleted card.
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

  /** Single-row form of consumeMaterials, for create/update/remove. */
  private updateMaterialUsed(
    productId: number,
    newYield: number,
    oldYield: number,
    date: Date,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    return this.consumeMaterials(tx, [
      { productId, date, delta: newYield - oldYield },
    ]);
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

  async create(body: CreateProductionDto, userId?: number) {
    // Yield and delivery are tracked independently: the central kitchen may hold
    // stock back, batch ahead, or split a batch across branches, so production
    // yield is no longer forced to equal that day's branch delivery.
    const oldYield = await this.findExistingYield(
      body.branchId,
      body.productId,
      toUtcDay(body.date),
    );

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.production.upsert({
        where: {
          branchId_productId_date: {
            branchId: body.branchId,
            productId: body.productId,
            date: toUtcDay(body.date),
          },
        },
        update: {
          yield: body.yield,
          notes: body.notes,
        },
        create: {
          branchId: body.branchId,
          productId: body.productId,
          date: toUtcDay(body.date),
          yield: body.yield,
          notes: body.notes,
          createdById: userId,
        },
        include: {
          branch: true,
          product: true,
        },
      });
      await this.updateMaterialUsed(
        body.productId,
        body.yield,
        oldYield,
        toUtcDay(body.date),
        tx,
      );
      return result;
    });
  }

  async createBulk(items: CreateProductionDto[], userId?: number) {
    // Yield is recorded independently of delivery (holdback / batch-ahead /
    // split delivery are all legitimate), so no yield-equals-delivery check.
    const keys = items.map((item) => ({
      branchId: item.branchId,
      productId: item.productId,
      date: toUtcDay(item.date),
    }));

    const existingMap = new Map<string, number>();
    const existingRows = await this.prisma.production.findMany({
      where: { OR: this.buildCompositeWhere(keys) },
      select: { branchId: true, productId: true, date: true, yield: true },
    });
    for (const row of existingRows) {
      existingMap.set(
        `${row.branchId}:${row.productId}:${dateKey(row.date)}`,
        row.yield,
      );
    }

    const results = await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.production.upsert({
          where: {
            branchId_productId_date: {
              branchId: item.branchId,
              productId: item.productId,
              date: toUtcDay(item.date),
            },
          },
          update: {
            yield: item.yield,
            notes: item.notes,
          },
          create: {
            branchId: item.branchId,
            productId: item.productId,
            date: toUtcDay(item.date),
            yield: item.yield,
            notes: item.notes,
            createdById: userId,
          },
        }),
      ),
    );

    // Batch-update material usage for all changed items in a single pass
    const changedItems = items.filter(
      (item) =>
        item.yield !==
        (existingMap.get(
          `${item.branchId}:${item.productId}:${dateKey(toUtcDay(item.date))}`,
        ) ?? 0),
    );
    if (changedItems.length > 0) {
      const productIds = [...new Set(changedItems.map((i) => i.productId))];
      const recipes = await this.prisma.recipe.findMany({
        where: { productId: { in: productIds }, deletedAt: null },
        include: { recipeItems: { include: { material: true } } },
      });
      const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));
      const conversionPairs = recipes.flatMap((r) =>
        r.recipeItems.map((ri) => ({
          fromUnit: ri.unit,
          toUnit: ri.material.unit,
        })),
      );
      const conversionMap = await getConversionFactorMap(
        this.prisma,
        conversionPairs,
      );
      const dateObjs = changedItems.map((i) => toUtcDay(i.date));
      const deltaMap = this.buildMaterialDeltaMap(
        changedItems,
        dateObjs,
        existingMap,
        recipeByProduct,
        conversionMap,
      );
      await this.applyMaterialDeltaUpserts(deltaMap);
    }

    return results;
  }

  /**
   * Upsert production records without requiring matching inventory delivery rows.
   * Used for seamless yield entry — creates the row on first edit, updates on subsequent edits.
   */
  async upsertBulk(
    items: Array<{
      productId: number;
      date: string;
      yield: number;
      branchId?: number;
    }>,
    userId?: number,
  ) {
    const defaultBranchId = PRODUCTION_BRANCH_ID;
    const dateObjs = items.map((i) => toUtcDay(i.date));
    const keys = items.map((item, idx) => ({
      branchId: item.branchId ?? defaultBranchId,
      productId: item.productId,
      date: dateObjs[idx],
    }));

    const existingRows = await this.prisma.production.findMany({
      where: { OR: this.buildCompositeWhere(keys) },
      select: { branchId: true, productId: true, date: true, yield: true },
    });
    const existingMap = new Map<string, number>();
    for (const row of existingRows) {
      existingMap.set(
        `${row.branchId}:${row.productId}:${dateKey(row.date)}`,
        row.yield,
      );
    }

    const results = await this.prisma.$transaction(
      items.map((item, idx) => {
        const bId = item.branchId ?? defaultBranchId;
        const date = dateObjs[idx];
        return this.prisma.production.upsert({
          where: {
            branchId_productId_date: {
              branchId: bId,
              productId: item.productId,
              date,
            },
          },
          update: { yield: item.yield },
          create: {
            branchId: bId,
            productId: item.productId,
            date,
            yield: item.yield,
            createdById: userId,
          },
        });
      }),
    );

    const changedItems = items.filter(
      (item, idx) =>
        item.yield !==
        (existingMap.get(
          `${item.branchId ?? defaultBranchId}:${item.productId}:${dateKey(dateObjs[idx])}`,
        ) ?? 0),
    );
    if (changedItems.length > 0) {
      const productIds = [...new Set(changedItems.map((i) => i.productId))];
      const recipes = await this.prisma.recipe.findMany({
        where: { productId: { in: productIds }, deletedAt: null },
        include: { recipeItems: { include: { material: true } } },
      });
      const recipeByProduct = new Map(recipes.map((r) => [r.productId, r]));
      const conversionPairs = recipes.flatMap((r) =>
        r.recipeItems.map((ri) => ({
          fromUnit: ri.unit,
          toUnit: ri.material.unit,
        })),
      );
      const conversionMap = await getConversionFactorMap(
        this.prisma,
        conversionPairs,
      );
      const changedDateObjs = changedItems.map(
        (item) => dateObjs[items.indexOf(item)],
      );
      const deltaMap = this.buildMaterialDeltaMap(
        changedItems,
        changedDateObjs,
        existingMap,
        recipeByProduct,
        conversionMap,
        defaultBranchId,
      );
      await this.applyMaterialDeltaUpserts(deltaMap);
    }

    return results;
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

  async update(id: number, body: UpdateProductionDto, branchId?: number) {
    const old = await this.prisma.production.findFirst({
      where: { id, ...(branchId != null ? { branchId } : {}) },
    });
    if (!old) throw new NotFoundException('Production record not found');

    try {
      const yieldChanged = body.yield !== undefined && body.yield !== old.yield;
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.production.update({
          where: { id },
          data: {
            branchId: body.branchId,
            productId: body.productId,
            date: body.date ? toUtcDay(body.date) : undefined,
            yield: body.yield,
            notes: body.notes,
          },
          include: { branch: true, product: true },
        });

        if (yieldChanged) {
          await this.updateMaterialUsed(
            updated.productId,
            updated.yield,
            old.yield,
            updated.date,
            tx,
          );
        }
        return updated;
      });
    } catch {
      throw new NotFoundException('Production record not found');
    }
  }

  async remove(id: number, branchId?: number) {
    const rec = await this.prisma.production.findFirst({
      where: { id, ...(branchId != null ? { branchId } : {}) },
    });
    if (!rec) throw new NotFoundException('Production record not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.production.delete({ where: { id } });
      await this.updateMaterialUsed(rec.productId, 0, rec.yield, rec.date, tx);
      return rec;
    });
  }
}
