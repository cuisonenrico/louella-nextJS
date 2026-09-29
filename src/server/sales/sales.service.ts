import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  loadPriceHistory,
  revenueCentavos,
  type PriceHistoryMap,
} from '../common/utils/price-history.util';
import { centavos, pesos } from '../common/utils/decimal.util';
import { computeSold } from '../common/utils/inventory-metrics.util';
import {
  MAX_REPORT_RANGE_DAYS,
  assertDateRange,
  toUtcDay,
} from '../common/utils/date-range.util';

/**
 * A bounded date range on Manila days. These endpoints used to hand the
 * strings to `new Date` and accept any span, so one request could scan every
 * inventory row the business has, adjustments included.
 */
function dayRange(startDate: string, endDate: string) {
  const gte = toUtcDay(startDate);
  const lte = toUtcDay(endDate);
  assertDateRange(gte, lte, MAX_REPORT_RANGE_DAYS);
  return { gte, lte };
}

type InventoryRow = {
  id: number;
  date: Date;
  quantity: number;
  delivery: number;
  leftover: number;
  reject: number;
  leftoverCountedAt: Date | null;
  notes: string | null;
  branch: { id: number; name: string };
  product: {
    id: number;
    name: string;
    type: string;
    price: number | { toNumber(): number };
  };
  adjustments: Array<{ type: string; value: number }>;
};

function computeRow(row: InventoryRow, historyByProduct: PriceHistoryMap) {
  const sold = computeSold(row);
  const revenue = revenueCentavos(sold, { productId: row.product.id, date: row.date, product: row.product }, historyByProduct);
  return {
    inventoryId: row.id,
    date: row.date,
    branch: row.branch,
    product: row.product,
    quantity: row.quantity,
    delivery: row.delivery,
    leftover: row.leftover,
    reject: row.reject,
    sold,
    sales: pesos(revenue),
    // Settled once someone has counted the leftover. Until then the row's
    // close is derived and it has sold nothing yet.
    settled: row.leftoverCountedAt !== null,
    notes: row.notes,
  };
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly salesSelect = {
    id: true,
    date: true,
    quantity: true,
    delivery: true,
    leftover: true,
    reject: true,
    leftoverCountedAt: true,
    notes: true,
    branch: { select: { id: true, name: true } },
    product: { select: { id: true, name: true, type: true, price: true } },
    adjustments: {
      select: { type: true, value: true },
      where: { deletedAt: null },
    },
  } as const;

  private fetchHistoryMap(productIds: number[]): Promise<PriceHistoryMap> {
    return loadPriceHistory(this.prisma, productIds);
  }

  // Sales for a specific branch on a specific date
  async getByBranchAndDate(branchId: number, date: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { branchId, date: toUtcDay(date), deletedAt: null },
      select: this.salesSelect,
      orderBy: [
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
    });

    const historyByProduct = await this.fetchHistoryMap([
      ...new Set(rows.map((r) => r.product.id)),
    ]);
    const breakdown = rows.map((r) => computeRow(r, historyByProduct));
    return {
      branchId,
      date,
      breakdown,
      totals: computeTotals(breakdown),
    };
  }

  // Sales for a branch over a date range
  async getByBranch(branchId: number, startDate: string, endDate: string) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        branchId,
        date: dayRange(startDate, endDate),
        deletedAt: null,
      },
      select: this.salesSelect,
      orderBy: [
        { date: 'asc' },
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
    });

    const historyByProduct = await this.fetchHistoryMap([
      ...new Set(rows.map((r) => r.product.id)),
    ]);
    const breakdown = rows.map((r) => computeRow(r, historyByProduct));
    return {
      branchId,
      startDate,
      endDate,
      breakdown,
      totals: computeTotals(breakdown),
    };
  }

  // Sales for a specific product in a specific branch over a date range
  async getByBranchAndProduct(
    branchId: number,
    productId: number,
    startDate: string,
    endDate: string,
  ) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        branchId,
        productId,
        date: dayRange(startDate, endDate),
        deletedAt: null,
      },
      select: this.salesSelect,
      orderBy: { date: 'asc' },
    });

    const historyByProduct = await this.fetchHistoryMap([
      ...new Set(rows.map((r) => r.product.id)),
    ]);
    const breakdown = rows.map((r) => computeRow(r, historyByProduct));
    return {
      branchId,
      productId,
      startDate,
      endDate,
      breakdown,
      totals: computeTotals(breakdown),
    };
  }

  // Sales for a product across all branches over a date range
  async getByProduct(
    productId: number,
    startDate: string,
    endDate: string,
    branchId?: number,
  ) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        productId,
        ...(branchId != null ? { branchId } : {}),
        date: dayRange(startDate, endDate),
        deletedAt: null,
      },
      select: this.salesSelect,
      orderBy: [{ date: 'asc' }, { branch: { name: 'asc' } }],
    });

    const historyByProduct = await this.fetchHistoryMap([
      ...new Set(rows.map((r) => r.product.id)),
    ]);
    const breakdown = rows.map((r) => computeRow(r, historyByProduct));
    return {
      productId,
      startDate,
      endDate,
      breakdown,
      totals: computeTotals(breakdown),
    };
  }

  // Daily sales summary for a branch (one row per day, all products aggregated)
  async getDailySummary(branchId: number, startDate: string, endDate: string) {
    const [summary] = await this.getDailySummaries([branchId], startDate, endDate);
    return summary;
  }

  /**
   * getDailySummary for several branches in two queries. The branch-cash
   * period view needs every branch; it used to call the one-branch version
   * once per branch.
   */
  async getDailySummaries(branchIds: number[], startDate: string, endDate: string) {
    const all = await this.prisma.inventory.findMany({
      where: {
        branchId: { in: branchIds },
        date: dayRange(startDate, endDate),
        deletedAt: null,
      },
      select: this.salesSelect,
      orderBy: { date: 'asc' },
    });
    const historyByProduct = await this.fetchHistoryMap(all.map((r) => r.product.id));
    return branchIds.map((branchId) =>
      this.summarise(branchId, startDate, endDate, all.filter((r) => r.branch.id === branchId), historyByProduct),
    );
  }

  private summarise(
    branchId: number,
    startDate: string,
    endDate: string,
    rows: InventoryRow[],
    historyByProduct: PriceHistoryMap,
  ) {

    const computed = rows.map((r) => computeRow(r, historyByProduct));

    // Group by date
    const byDate = new Map<string, ReturnType<typeof computeRow>[]>();
    for (const row of computed) {
      const key = row.date.toISOString().split('T')[0];
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(row);
    }

    const dailySummary = Array.from(byDate.entries()).map(([date, rows]) => ({
      date,
      ...computeTotals(rows),
    }));

    return {
      branchId,
      startDate,
      endDate,
      dailySummary,
      totals: computeTotals(computed),
    };
  }
}

function computeTotals(rows: ReturnType<typeof computeRow>[]) {
  const settled = rows.filter((r) => r.settled);
  return {
    totalSold: rows.reduce((s, r) => s + r.sold, 0),
    // Whole centavos: exact, whatever order the rows are added in.
    totalSales: pesos(rows.reduce((s, r) => s + centavos(r.sales), 0)),
    totalDelivery: rows.reduce((s, r) => s + r.delivery, 0),
    totalReject: rows.reduce((s, r) => s + r.reject, 0),
    // Rows (one product on one day), not calendar days.
    settledDays: settled.length,
    unsettledDays: rows.length - settled.length,
  };
}
