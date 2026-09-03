import { Injectable } from '@nestjs/common';
import { ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeAdjSum } from '../common/utils/inventory-metrics.util';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { CACHE_NS } from '../common/cache/cache-namespaces';

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

/**
 * Every field is optional because each maps to a dashboard panel permission and
 * is omitted entirely when the caller does not hold that panel's key.
 *
 * Omitted, not blanked: a `dashboard:revenue-trend` denial has to mean the
 * numbers never left the server, otherwise the panel gate is decoration that
 * anyone can defeat with devtools. Field names live here in typed code rather
 * than as strings in the manifest, so renaming one is a compile error instead
 * of a strip that silently stops matching.
 */
export interface DashboardSummaryResponse {
  /** `dashboard:kpis` */
  stats?: DashboardStats;
  /** `dashboard:production-mix` */
  production?: DashboardProduction;
  /** `dashboard:low-stock` */
  lowStock?: LowStockItem[];
  /** `dashboard:kpis` */
  products?: DashboardProduct[];
  /** `dashboard:branch-gaps` */
  branches?: DashboardBranch[];
  /**
   * Active branches with no inventory entered for the date.
   *
   * Computed here rather than in the browser. The dashboard used to derive this
   * by calling the ungated `GET /branches` and cross-referencing inventory
   * client-side, which handed every branch manager a roster of every branch and
   * which ones were behind - cross-branch information BranchGuard could not
   * intercept, because the leak was in a second, unscoped query rather than in
   * the guarded one. Computing it server-side puts it back inside the scope.
   */
  branchGaps?: DashboardBranch[];
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheNamespaceService,
  ) {}

  /**
   * The panel keys the summary actually branches on.
   *
   * The cache key needs the permissions that change the *shape* of the
   * response, not the caller's whole 87-key grant list — keying on all of them
   * would make the key enormous and cache-miss for every user.
   */
  private static readonly SUMMARY_PERMISSION_KEYS = [
    'dashboard:kpis',
    'dashboard:production-mix',
    'dashboard:low-stock',
    'dashboard:branch-gaps',
    'dashboard:rejections',
  ] as const;

  getSummary(
    date: string,
    branchId: number | undefined,
    permissions: readonly string[],
  ): Promise<DashboardSummaryResponse> {
    const shape = DashboardService.SUMMARY_PERMISSION_KEYS.map((k) =>
      permissions.includes(k) ? '1' : '0',
    ).join('');

    return this.cache.wrap(
      CACHE_NS.DASHBOARD_AGG,
      ['summary', date, branchId ?? 'all', shape],
      () => this.getSummaryUncached(date, branchId, permissions),
    );
  }

  private async getSummaryUncached(
    date: string,
    branchId: number | undefined,
    permissions: readonly string[],
  ): Promise<DashboardSummaryResponse> {
    const targetDate = new Date(date);
    const can = (key: string) => permissions.includes(key);

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
        where: {
          deletedAt: null,
          // Scoped callers see only their own branch here, so neither the
          // roster nor the gap list can name anyone else's.
          ...(branchId != null ? { id: branchId } : {}),
        },
        select: { id: true, name: true, address: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const response: DashboardSummaryResponse = {};

    if (can('dashboard:kpis')) {
      response.stats = {
        products: { total: totalProducts, active: activeProducts },
        branches: { total: totalBranches, active: activeBranches },
        materials: { total: totalMaterials },
        recipes: { total: totalRecipes },
      };
      response.products = recentProducts.map((p) => ({
        ...p,
        price: p.price.toNumber(),
      }));
    }

    if (can('dashboard:production-mix')) {
      response.production = this.aggregateProduction(date, productionRecords);
    }

    if (can('dashboard:low-stock')) {
      response.lowStock = await this.resolveLowStock(materialsWithReorder);
    }

    // The branch roster also backs the rejections card's branch filter, so it
    // travels with either panel. It is already narrowed to the caller's scope.
    if (can('dashboard:branch-gaps') || can('dashboard:rejections')) {
      response.branches = allBranches;
    }

    if (can('dashboard:branch-gaps')) {
      response.branchGaps = await this.resolveBranchGaps(
        targetDate,
        branchId,
        allBranches,
      );
    }

    return response;
  }

  /**
   * Active branches with nothing entered for the date.
   *
   * `branches` is already narrowed to the caller's scope, so a manager confined
   * to one branch can only ever learn about that branch.
   */
  private async resolveBranchGaps(
    targetDate: Date,
    branchId: number | undefined,
    branches: DashboardBranch[],
  ): Promise<DashboardBranch[]> {
    const active = branches.filter((b) => b.isActive);
    if (active.length === 0) return [];

    const entered = await this.prisma.inventory.findMany({
      where: {
        date: targetDate,
        deletedAt: null,
        ...(branchId != null ? { branchId } : {}),
      },
      select: { branchId: true },
      distinct: ['branchId'],
    });
    const withEntries = new Set(entered.map((row) => row.branchId));

    return active.filter((b) => !withEntries.has(b.id));
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
        const adjDelta = computeAdjSum(inv.adjustments);
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
