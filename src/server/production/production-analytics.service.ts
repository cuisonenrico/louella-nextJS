import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  getConversionFactorMap,
  requireFactor,
} from '../common/utils/unit-conversion.util';
import {
  computeAdjSum,
  computeSold,
} from '../common/utils/inventory-metrics.util';
import {
  MAX_REPORT_RANGE_DAYS,
  assertDateRange,
  toUtcDay,
} from '../common/utils/date-range.util';
import {
  loadMaterialPrices,
  loadRecipeVersions,
  materialPriceOn,
  recipeOn,
} from '../common/utils/recipe-version.util';

@Injectable()
export class ProductionAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Material cost of one production record, as it was on its day: the recipe
   * version then in force and each material's price that day (decision
   * 2026-09-19). Both used to be today's, so editing a recipe or repricing
   * flour rewrote every past day's cost.
   */
  async getMaterialConsumption(
    id: number,
    plannedYield?: number,
    branchId?: number,
  ) {
    const production = await this.prisma.production.findFirst({
      where: { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) },
      include: { product: true },
    });
    if (!production) throw new NotFoundException('Production record not found');

    // Use planned yield for cost calculation if provided
    const costYield = plannedYield ?? production.yield;

    const versions = await loadRecipeVersions(this.prisma, [production.productId]);
    const recipe = recipeOn(versions.get(production.productId), production.date);

    const empty = {
      productionId: id,
      productName: production.product.name,
      date: production.date,
      yield: production.yield,
      plannedYield: costYield,
      recipeVersion: recipe?.version ?? null,
      items: [],
      totalMaterialCost: 0,
    };
    if (!recipe || recipe.items.length === 0) return empty;

    const [conversionMap, prices] = await Promise.all([
      getConversionFactorMap(
        this.prisma,
        recipe.items.map((item) => ({ fromUnit: item.unit, toUnit: item.material.unit })),
      ),
      loadMaterialPrices(this.prisma, recipe.items.map((i) => i.materialId)),
    ]);

    const items = recipe.items.map((item) => {
      const factor = requireFactor(
        conversionMap,
        item.unit,
        item.material.unit,
        item.material.name,
      );
      const consumed = this.computeConsumedAmount(
        costYield,
        recipe.recipeYield,
        item.quantity,
        factor,
      );
      const pricePerUnit = materialPriceOn(item.material, production.date, prices);
      const totalCost = consumed * pricePerUnit;
      return {
        materialId: item.material.id,
        materialName: item.material.name,
        materialUnit: item.material.unit,
        recipeUnit: item.unit,
        consumed: Math.round(consumed * 10000) / 10000,
        pricePerUnit,
        totalCost: Math.round(totalCost * 100) / 100,
      };
    });

    const totalMaterialCost =
      Math.round(items.reduce((sum, i) => sum + i.totalCost, 0) * 100) / 100;

    return { ...empty, items, totalMaterialCost };
  }

  private computeConsumedAmount(
    yieldAmt: number,
    recipeYield: number,
    qty: number,
    factor: number,
  ): number {
    return (yieldAmt / recipeYield) * qty * factor;
  }

  /** A day's material use and cost, at that day's recipes and prices. */
  async getMaterialConsumptionSummary(date: string, branchId?: number) {
    const day = toUtcDay(date);
    const productions = await this.prisma.production.findMany({
      where: { date: day, deletedAt: null, ...(branchId ? { branchId } : {}) },
      include: { product: true },
    });

    const versions = await loadRecipeVersions(
      this.prisma,
      productions.map((p) => p.productId),
    );
    const resolved = productions.map((prod) => ({
      prod,
      recipe: recipeOn(versions.get(prod.productId), day),
    }));
    const allItems = resolved.flatMap(({ recipe }) => recipe?.items ?? []);

    const [conversionMap, prices] = await Promise.all([
      getConversionFactorMap(
        this.prisma,
        allItems.map((item) => ({ fromUnit: item.unit, toUnit: item.material.unit })),
      ),
      loadMaterialPrices(this.prisma, allItems.map((i) => i.materialId)),
    ]);

    const materialMap = new Map<
      number,
      {
        materialId: number;
        materialName: string;
        unit: string;
        totalConsumed: number;
        totalCost: number;
      }
    >();

    for (const { prod, recipe } of resolved) {
      if (!recipe) continue;
      for (const item of recipe.items) {
        const factor = requireFactor(
          conversionMap,
          item.unit,
          item.material.unit,
          item.material.name,
        );
        const consumed = this.computeConsumedAmount(
          prod.yield,
          recipe.recipeYield,
          item.quantity,
          factor,
        );
        const totalCost = consumed * materialPriceOn(item.material, day, prices);

        const existing = materialMap.get(item.materialId);
        if (existing) {
          existing.totalConsumed += consumed;
          existing.totalCost += totalCost;
        } else {
          materialMap.set(item.materialId, {
            materialId: item.materialId,
            materialName: item.material.name,
            unit: item.material.unit,
            totalConsumed: consumed,
            totalCost,
          });
        }
      }
    }

    const items = Array.from(materialMap.values()).map((i) => ({
      ...i,
      totalConsumed: Math.round(i.totalConsumed * 10000) / 10000,
      totalCost: Math.round(i.totalCost * 100) / 100,
    }));

    const grandTotalCost =
      Math.round(items.reduce((sum, i) => sum + i.totalCost, 0) * 100) / 100;

    return { date, items, grandTotalCost };
  }

  /**
   * Sell-through and waste per product over a date range.
   *
   * Every unit a branch had in the period ends up in exactly one of three
   * places: sold, rejected, or still on hand at the close of the last day.
   * `available` is their sum, so the three shares always add to 100%.
   *
   *   sold         = Σ computeSold(row)   — the canonical formula, which counts
   *                                         opening stock and adjustments
   *   closingStock = leftover on each branch's last day in the range
   *   wasteRate    = reject / available
   *
   * Leftover is *not* waste: it carries forward as the next day's opening
   * stock and is still sold. The previous version computed
   * `sold = delivered − leftover − reject` (ignoring opening stock and
   * transfers) and counted every day's leftover as waste — so bread that sat
   * on the shelf for three days was wasted three times.
   */
  async getEfficiency(startDate: string, endDate: string, branchId?: number) {
    const start = toUtcDay(startDate);
    const end = toUtcDay(endDate);
    assertDateRange(start, end, MAX_REPORT_RANGE_DAYS);

    const branchFilter = branchId ? { branchId } : {};
    const [productions, inventoryRows] = await Promise.all([
      this.prisma.production.findMany({
        where: { date: { gte: start, lte: end }, deletedAt: null, ...branchFilter },
        select: {
          productId: true,
          yield: true,
          product: { select: { name: true, type: true } },
        },
      }),
      this.prisma.inventory.findMany({
        where: { date: { gte: start, lte: end }, deletedAt: null, ...branchFilter },
        orderBy: { date: 'asc' },
        select: {
          productId: true,
          branchId: true,
          quantity: true,
          delivery: true,
          leftover: true,
          reject: true,
          adjustments: {
            where: { deletedAt: null },
            select: { type: true, value: true },
          },
          product: { select: { name: true, type: true } },
        },
      }),
    ]);

    type Acc = {
      productId: number;
      productName: string;
      productType: string;
      totalYield: number;
      openingStock: number;
      totalDelivered: number;
      netAdjustments: number;
      sold: number;
      totalReject: number;
      closingStock: number;
    };
    const byProduct = new Map<number, Acc>();
    const accFor = (
      productId: number,
      product: { name: string; type: string },
    ): Acc => {
      let acc = byProduct.get(productId);
      if (!acc) {
        acc = {
          productId,
          productName: product.name,
          productType: product.type,
          totalYield: 0,
          openingStock: 0,
          totalDelivered: 0,
          netAdjustments: 0,
          sold: 0,
          totalReject: 0,
          closingStock: 0,
        };
        byProduct.set(productId, acc);
      }
      return acc;
    };

    for (const prod of productions) {
      accFor(prod.productId, prod.product).totalYield += prod.yield;
    }

    // Rows arrive date-ascending, so per branch the first row seen opens the
    // period and the last one closes it.
    const firstSeen = new Set<string>();
    const lastLeftover = new Map<string, { productId: number; leftover: number }>();
    for (const row of inventoryRows) {
      const acc = accFor(row.productId, row.product);
      const key = `${row.productId}:${row.branchId}`;
      if (!firstSeen.has(key)) {
        firstSeen.add(key);
        acc.openingStock += row.quantity;
      }
      acc.totalDelivered += row.delivery;
      acc.netAdjustments += computeAdjSum(row.adjustments);
      acc.sold += computeSold(row);
      acc.totalReject += row.reject;
      lastLeftover.set(key, { productId: row.productId, leftover: row.leftover });
    }
    for (const { productId, leftover } of lastLeftover.values()) {
      byProduct.get(productId)!.closingStock += leftover;
    }

    const rate = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 10000) / 10000 : 0;

    return (
      Array.from(byProduct.values())
        .map((p) => {
          const available = p.sold + p.totalReject + p.closingStock;
          return {
            ...p,
            available,
            soldRate: rate(p.sold, available),
            wasteRate: rate(p.totalReject, available),
          };
        })
        // Autofill creates a zero placeholder for every product and day;
        // a product with nothing produced and nothing on hand is not data.
        .filter((p) => p.totalYield !== 0 || p.available !== 0)
    );
  }
}
