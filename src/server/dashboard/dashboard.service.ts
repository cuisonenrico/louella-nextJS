import { Injectable } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardStats {
  products: { total: number; active: number };
  branches: { total: number; active: number };
  materials: { total: number };
  recipes: { total: number };
}

export interface ProductionTypeBreakdown {
  type: ProductType;
  totalYield: number;
}

export interface DashboardProduction {
  date: string;
  totalYield: number;
  byType: ProductionTypeBreakdown[];
}

export interface LowStockItem {
  id: number;
  name: string;
  unit: string;
  currentStock: number;
  reorderLevel: number;
}

export interface DashboardProduct {
  id: number;
  name: string;
  type: ProductType;
  price: number;
  isActive: boolean;
}

export interface DashboardBranch {
  id: number;
  name: string;
  address: string | null;
  isActive: boolean;
}

export interface DashboardSummaryResponse {
  stats: DashboardStats;
  production: DashboardProduction;
  lowStock: LowStockItem[];
  products: DashboardProduct[];
  branches: DashboardBranch[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    date: string,
    branchId?: number,
  ): Promise<DashboardSummaryResponse> {
    const targetDate = new Date(date);

    const [
      totalProducts,
      activeProducts,
      totalBranches,
      activeBranches,
      totalMaterials,
      totalRecipes,
      productionRecords,
      materialsWithReorder,
      recentProducts,
      allBranches,
    ] = await Promise.all([
      this.prisma.product.count({ where: { deletedAt: null } }),
      this.prisma.product.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.branch.count({ where: { deletedAt: null } }),
      this.prisma.branch.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.material.count({ where: { deletedAt: null } }),
      this.prisma.recipe.count(),
      this.prisma.production.findMany({
        where: { date: targetDate, ...(branchId != null ? { branchId } : {}) },
        select: { yield: true, product: { select: { type: true } } },
      }),
      this.prisma.material.findMany({
        where: { deletedAt: null, reorderLevel: { gt: 0 } },
        select: { id: true, name: true, unit: true, reorderLevel: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          type: true,
          price: true,
          isActive: true,
        },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        take: 8,
      }),
      this.prisma.branch.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, address: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const lowStock = await this.resolveLowStock(materialsWithReorder);
    const production = this.aggregateProduction(date, productionRecords);

    return {
      stats: {
        products: { total: totalProducts, active: activeProducts },
        branches: { total: totalBranches, active: activeBranches },
        materials: { total: totalMaterials },
        recipes: { total: totalRecipes },
      },
      production,
      lowStock,
      products: recentProducts.map((p) => ({
        ...p,
        price: p.price.toNumber(),
      })),
      branches: allBranches,
    };
  }

  private aggregateProduction(
    date: string,
    records: { yield: number; product: { type: ProductType } }[],
  ): DashboardProduction {
    const yieldMap = new Map<ProductType, number>();
    for (const rec of records) {
      yieldMap.set(
        rec.product.type,
        (yieldMap.get(rec.product.type) ?? 0) + rec.yield,
      );
    }
    const byType: ProductionTypeBreakdown[] = Array.from(
      yieldMap.entries(),
    ).map(([type, totalYield]) => ({ type, totalYield }));
    const totalYield = byType.reduce((sum, t) => sum + t.totalYield, 0);
    return { date, totalYield, byType };
  }

  private async resolveLowStock(
    materials: {
      id: number;
      name: string;
      unit: string;
      reorderLevel: number | { toNumber(): number };
    }[],
  ): Promise<LowStockItem[]> {
    if (materials.length === 0) return [];

    // Find the latest date per material, then fetch only those records.
    const materialIds = materials.map((m) => m.id);
    const latestDates = await this.prisma.materialInventory.groupBy({
      by: ['materialId'],
      where: { materialId: { in: materialIds } },
      _max: { date: true },
    });

    const orConditions = latestDates
      .filter((r) => r._max.date !== null)
      .map((r) => ({ materialId: r.materialId, date: r._max.date! }));

    const latestByMaterial = new Map<
      number,
      { quantity: number; delivery: number; used: number; adjDelta: number }
    >();

    if (orConditions.length > 0) {
      const latestInventories = await this.prisma.materialInventory.findMany({
        where: { OR: orConditions },
        select: {
          materialId: true,
          quantity: true,
          delivery: true,
          used: true,
          adjustments: {
            where: { deletedAt: null },
            select: { type: true, value: true },
          },
        },
      });

      for (const inv of latestInventories) {
        const adjDelta = inv.adjustments.reduce(
          (sum, a) => (a.type === 'PULL_IN' ? sum + a.value : sum - a.value),
          0,
        );
        latestByMaterial.set(inv.materialId, {
          quantity: inv.quantity,
          delivery: inv.delivery,
          used: inv.used,
          adjDelta,
        });
      }
    }

    const result: LowStockItem[] = [];
    for (const material of materials) {
      const inv = latestByMaterial.get(material.id);
      const currentStock = inv
        ? Math.max(0, inv.quantity + inv.delivery - inv.used + inv.adjDelta)
        : 0;
      const reorderLevelNum = Number(material.reorderLevel);
      if (currentStock < reorderLevelNum) {
        result.push({
          id: material.id,
          name: material.name,
          unit: material.unit,
          currentStock,
          reorderLevel: reorderLevelNum,
        });
      }
    }
    return result;
  }
}
