import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectivePrice } from '../common/utils/price-history.util';
import { computeSold } from '../common/utils/inventory-metrics.util';

type InventoryRow = {
  id: number;
  date: Date;
  quantity: number;
  delivery: number;
  leftover: number | null;
  reject: number;
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

type HistoryMap = Map<number, { price: number; effectiveAt: Date }[]>;

function computeRow(row: InventoryRow, historyByProduct: HistoryMap) {
  const sold = computeSold({
    quantity: row.quantity,
    delivery: row.delivery,
    leftover: row.leftover ?? 0,
    reject: row.reject,
    adjustments: row.adjustments,
  });
  const effectivePrice = getEffectivePrice(
    row.product.id,
    row.date,
    Number(row.product.price),
    historyByProduct,
  );
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
    sales: parseFloat((sold * effectivePrice).toFixed(2)),
    settled: row.leftover !== null,
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
    notes: true,
    branch: { select: { id: true, name: true } },
    product: { select: { id: true, name: true, type: true, price: true } },
    adjustments: {
      select: { type: true, value: true },
      where: { deletedAt: null },
    },
  } as const;

  private async fetchHistoryMap(productIds: number[]): Promise<HistoryMap> {
    if (productIds.length === 0) return new Map();
    const histories = await this.prisma.productPriceHistory.findMany({
      where: { productId: { in: productIds } },
      orderBy: { effectiveAt: 'asc' },
    });
    const map: HistoryMap = new Map();
    for (const h of histories) {
      const arr = map.get(h.productId) ?? [];
      arr.push({ price: h.price.toNumber(), effectiveAt: h.effectiveAt });
      map.set(h.productId, arr);
    }
    return map;
  }

  // Sales for a specific branch on a specific date
  async getByBranchAndDate(branchId: number, date: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { branchId, date: new Date(date), deletedAt: null },
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
        date: { gte: new Date(startDate), lte: new Date(endDate) },
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
        date: { gte: new Date(startDate), lte: new Date(endDate) },
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
        date: { gte: new Date(startDate), lte: new Date(endDate) },
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
    const rows = await this.prisma.inventory.findMany({
      where: {
        branchId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
        deletedAt: null,
      },
      select: this.salesSelect,
      orderBy: { date: 'asc' },
    });

    const historyByProduct = await this.fetchHistoryMap([
      ...new Set(rows.map((r) => r.product.id)),
    ]);
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
    totalSales: parseFloat(rows.reduce((s, r) => s + r.sales, 0).toFixed(2)),
    totalDelivery: rows.reduce((s, r) => s + r.delivery, 0),
    totalReject: rows.reduce((s, r) => s + r.reject, 0),
    settledDays: settled.length,
    unsettledDays: rows.length - settled.length,
  };
}
