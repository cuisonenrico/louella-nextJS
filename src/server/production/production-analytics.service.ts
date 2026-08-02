import { Injectable, NotFoundException } from '@nestjs/common';
import { MeasurementUnit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  dateKey,
  getConversionFactorMap,
} from '../common/utils/unit-conversion.util';

@Injectable()
export class ProductionAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMaterialConsumption(id: number, plannedYield?: number) {
    const production = await this.prisma.production.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!production) throw new NotFoundException('Production record not found');

    // Use planned yield for cost calculation if provided
    const costYield = plannedYield ?? production.yield;

    const recipe = await this.prisma.recipe.findUnique({
      where: { productId: production.productId },
      include: {
        recipeItems: {
          include: { material: true },
        },
      },
    });

    if (!recipe || recipe.recipeItems.length === 0) {
      return {
        productionId: id,
        productName: production.product.name,
        date: production.date,
        yield: production.yield,
        plannedYield: costYield,
        items: [],
        totalMaterialCost: 0,
      };
    }

    const conversionMap = await getConversionFactorMap(
      this.prisma,
      recipe.recipeItems.map((item) => ({
        fromUnit: item.unit,
        toUnit: item.material.unit,
      })),
    );

    const items: {
      materialId: number;
      materialName: string;
      materialUnit: string;
      recipeUnit: string;
      consumed: number;
      pricePerUnit: number;
      totalCost: number;
    }[] = [];

    for (const item of recipe.recipeItems) {
      const factor =
        conversionMap.get(`${item.unit}->${item.material.unit}`) ?? 1;
      const consumed = this.computeConsumedAmount(
        costYield,
        recipe.recipeYield,
        item.quantity,
        factor,
      );
      const totalCost = consumed * item.material.pricePerUnit.toNumber();

      items.push({
        materialId: item.material.id,
        materialName: item.material.name,
        materialUnit: item.material.unit,
        recipeUnit: item.unit,
        consumed: Math.round(consumed * 10000) / 10000,
        pricePerUnit: item.material.pricePerUnit.toNumber(),
        totalCost: Math.round(totalCost * 100) / 100,
      });
    }

    const totalMaterialCost =
      Math.round(items.reduce((sum, i) => sum + i.totalCost, 0) * 100) / 100;

    return {
      productionId: id,
      productName: production.product.name,
      date: production.date,
      yield: production.yield,
      plannedYield: costYield,
      items,
      totalMaterialCost,
    };
  }

  private computeConsumedAmount(
    yieldAmt: number,
    recipeYield: number,
    qty: number,
    factor: number,
  ): number {
    return (yieldAmt / recipeYield) * qty * factor;
  }

  async getMaterialConsumptionSummary(date: string, branchId?: number) {
    const where: { date: Date; branchId?: number } = { date: new Date(date) };
    if (branchId) where.branchId = branchId;

    const productions = await this.prisma.production.findMany({
      where,
      include: { product: true },
    });

    const productIds = Array.from(new Set(productions.map((p) => p.productId)));
    const recipes = await this.prisma.recipe.findMany({
      where: { productId: { in: productIds } },
      include: {
        recipeItems: {
          include: { material: true },
        },
      },
    });
    const recipeByProductId = new Map(recipes.map((r) => [r.productId, r]));

    const conversionPairs: Array<{
      fromUnit: MeasurementUnit;
      toUnit: MeasurementUnit;
    }> = [];
    for (const recipe of recipes) {
      for (const item of recipe.recipeItems) {
        conversionPairs.push({
          fromUnit: item.unit,
          toUnit: item.material.unit,
        });
      }
    }
    const conversionMap = await getConversionFactorMap(
      this.prisma,
      conversionPairs,
    );

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

    for (const prod of productions) {
      const recipe = recipeByProductId.get(prod.productId);
      if (!recipe || recipe.recipeItems.length === 0) continue;

      for (const item of recipe.recipeItems) {
        const factor =
          conversionMap.get(`${item.unit}->${item.material.unit}`) ?? 1;
        const consumed = this.computeConsumedAmount(
          prod.yield,
          recipe.recipeYield,
          item.quantity,
          factor,
        );
        const totalCost = consumed * item.material.pricePerUnit.toNumber();

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

  async getEfficiency(startDate: string, endDate: string, branchId?: number) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const prodWhere: { date: { gte: Date; lte: Date }; branchId?: number } = {
      date: { gte: start, lte: end },
    };
    if (branchId) prodWhere.branchId = branchId;

    const invWhere: { date: { gte: Date; lte: Date }; branchId?: number } = {
      date: { gte: start, lte: end },
    };
    if (branchId) invWhere.branchId = branchId;

    const [productions, inventoryRows] = await Promise.all([
      this.prisma.production.findMany({
        where: prodWhere,
        include: { product: true },
      }),
      this.prisma.inventory.findMany({
        where: invWhere,
        select: {
          productId: true,
          branchId: true,
          date: true,
          delivery: true,
          leftover: true,
          reject: true,
        },
      }),
    ]);
    const inventoryMap = new Map<
      string,
      { delivery: number; leftover: number; reject: number }
    >();
    for (const inv of inventoryRows) {
      inventoryMap.set(
        `${inv.productId}:${inv.branchId}:${dateKey(inv.date)}`,

        { delivery: inv.delivery, leftover: inv.leftover, reject: inv.reject },
      );
    }

    const productMap = new Map<
      number,
      {
        productId: number;
        productName: string;
        productType: string;
        totalYield: number;
        totalDelivered: number;
        totalLeftover: number;
        totalReject: number;
      }
    >();

    for (const prod of productions) {
      const inv = inventoryMap.get(
        `${prod.productId}:${prod.branchId}:${dateKey(prod.date)}`,
      );

      const delivered = inv?.delivery ?? 0;
      const leftover = inv?.leftover ?? 0;
      const reject = inv?.reject ?? 0;

      const existing = productMap.get(prod.productId);
      if (existing) {
        existing.totalYield += prod.yield;
        existing.totalDelivered += delivered;
        existing.totalLeftover += leftover;
        existing.totalReject += reject;
      } else {
        productMap.set(prod.productId, {
          productId: prod.productId,
          productName: prod.product.name,
          productType: prod.product.type,
          totalYield: prod.yield,
          totalDelivered: delivered,
          totalLeftover: leftover,
          totalReject: reject,
        });
      }
    }

    return Array.from(productMap.values()).map((p) => {
      const sold = p.totalDelivered - p.totalLeftover - p.totalReject;
      const soldRate = p.totalDelivered > 0 ? sold / p.totalDelivered : 0;
      const wasteRate =
        p.totalDelivered > 0
          ? (p.totalLeftover + p.totalReject) / p.totalDelivered
          : 0;
      return {
        ...p,
        sold,
        soldRate: Math.round(soldRate * 10000) / 10000,
        wasteRate: Math.round(wasteRate * 10000) / 10000,
      };
    });
  }
}
