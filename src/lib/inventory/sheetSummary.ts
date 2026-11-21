import type { Inventory, Product, ProductType } from '@/types';
import { rowFigures, type CountFields } from './rowFigures';

export interface ProductLine {
  productId: number;
  name: string;
  /** Set only when the sheet spans several branches. */
  branchName?: string;
  sold: number;
  revenue: number;
  reject: number;
  rejectValue: number;
  /** On hand at the end of the period. */
  leftover: number;
}

export interface SheetSummary {
  /** Every row's revenue, equipment charges included, so it matches the table's subtotals. */
  revenue: number;
  /** The part of `revenue` charged for missing equipment. */
  equipmentCharge: number;
  /** Pieces sold, equipment excluded. */
  sold: number;
  delivery: number;
  reject: number;
  rejectValue: number;
  /** On hand at the end of the period: each branch and product's leftover on its last day. */
  leftover: number;
  leftoverValue: number;
  /**
   * Share of the stock that sold, over counted products only (an uncounted one
   * has sold nothing yet and would drag it down; an over-count is left out too).
   * Null when nothing is counted.
   */
  sellThrough: number | null;
  revenueByType: Record<ProductType, number>;
  /** Rows nobody has counted yet: they show 0 sold until a leftover is entered. */
  uncounted: ProductLine[];
  /** Leftover plus rejects is more than the stock: a typed count the server will refuse. */
  overCounted: ProductLine[];
  /** Equipment counted lower than it had: pieces missing, charged like a sale. */
  equipmentMissing: ProductLine[];
  bestSellers: ProductLine[];
  /** Counted products that sold less than half their stock, most left over first. */
  slowMovers: ProductLine[];
  mostRejected: ProductLine[];
}

const TOP = 5;

/**
 * The sheet's summary, from the same per-row figures the table shows (unsaved
 * edits included), so it always agrees with the rows above it.
 *
 * Built from the raw rows, not the aggregated display rows: each raw row has its
 * own day's price and its own counted state, so sums across branches and days are exact.
 */
export function summarizeSheet(
  rows: Inventory[],
  pending: Map<number, CountFields>,
  productById: Map<number, Product>,
  { rankByRevenue }: { rankByRevenue: boolean },
): SheetSummary {
  const multiBranch = new Set(rows.map((r) => r.branchId)).size > 1;
  const revenueByType: Record<ProductType, number> = { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 };
  let revenueC = 0;
  let equipmentC = 0;
  let rejectValueC = 0;
  let sold = 0;
  let delivery = 0;
  let reject = 0;

  const uncounted: ProductLine[] = [];
  const overCounted: ProductLine[] = [];
  const equipmentMissing = new Map<string, ProductLine>();
  // Per branch+product: totals over the period, and the leftover on its last day.
  const lines = new Map<string, ProductLine & { anyUncounted: boolean; lastDate: string; lastPrice: number; equipment: boolean }>();

  for (const inv of rows) {
    const product = productById.get(inv.productId);
    const f = rowFigures(inv, pending.get(inv.id), product);
    const name = product?.name ?? inv.product?.name ?? `#${inv.productId}`;
    const branchName = multiBranch ? (inv.branch?.name ?? `Branch ${inv.branchId}`) : undefined;
    const base = { productId: inv.productId, name, branchName };
    const rowRevenueC = Math.round(f.revenue * 100);

    revenueC += rowRevenueC;
    if (product) revenueByType[product.type] = (revenueByType[product.type] ?? 0) + rowRevenueC;
    delivery += f.delivery;

    if (f.equipment) {
      equipmentC += rowRevenueC;
      if (f.sold > 0) {
        const key = `${inv.branchId}:${inv.productId}`;
        const prev = equipmentMissing.get(key);
        equipmentMissing.set(key, {
          ...base,
          sold: (prev?.sold ?? 0) + f.sold,
          revenue: (prev?.revenue ?? 0) + f.revenue,
          reject: 0,
          rejectValue: 0,
          leftover: 0,
        });
      }
    } else {
      sold += f.sold;
      reject += f.reject;
      rejectValueC += Math.round(f.reject * f.price * 100);
      const line = { ...base, sold: f.sold, revenue: f.revenue, reject: f.reject, rejectValue: f.reject * f.price, leftover: f.leftover };
      if (f.uncounted) uncounted.push(line);
      if (f.sold < 0) overCounted.push(line);
    }

    const key = `${inv.branchId}:${inv.productId}`;
    const day = inv.date.slice(0, 10);
    const prev = lines.get(key);
    if (!prev) {
      lines.set(key, {
        ...base,
        sold: f.sold,
        revenue: f.revenue,
        reject: f.reject,
        rejectValue: f.reject * f.price,
        leftover: f.leftover,
        anyUncounted: f.uncounted,
        lastDate: day,
        lastPrice: f.price,
        equipment: f.equipment,
      });
    } else {
      prev.sold += f.sold;
      prev.revenue += f.revenue;
      prev.reject += f.reject;
      prev.rejectValue += f.reject * f.price;
      prev.anyUncounted ||= f.uncounted;
      if (day > prev.lastDate) {
        prev.lastDate = day;
        prev.leftover = f.leftover;
        prev.lastPrice = f.price;
      }
    }
  }

  let leftover = 0;
  let leftoverValueC = 0;
  let countedSold = 0;
  let countedStock = 0;
  const goods: ProductLine[] = [];
  const counted: Array<ProductLine & { stock: number }> = [];
  for (const l of lines.values()) {
    if (l.equipment) continue;
    leftover += l.leftover;
    leftoverValueC += Math.round(l.leftover * l.lastPrice * 100);
    const line: ProductLine = {
      productId: l.productId,
      name: l.name,
      branchName: l.branchName,
      sold: l.sold,
      revenue: l.revenue,
      reject: l.reject,
      rejectValue: l.rejectValue,
      leftover: l.leftover,
    };
    goods.push(line);
    // An over-count is flagged on its own; as a figure it would only distort these.
    if (!l.anyUncounted && l.sold >= 0) {
      // What was there to sell: what sold, what was thrown out, and what is left.
      const stock = l.sold + l.reject + l.leftover;
      countedSold += l.sold;
      countedStock += stock;
      counted.push({ ...line, stock });
    }
  }

  const byName = (a: ProductLine, b: ProductLine) => a.name.localeCompare(b.name);
  const bestSellers = goods
    .filter((l) => l.sold > 0)
    .sort((a, b) => (rankByRevenue ? b.revenue - a.revenue : 0) || b.sold - a.sold || byName(a, b))
    .slice(0, TOP);
  const slowMovers = counted
    .filter((l) => l.stock > 0 && l.leftover > 0 && l.sold * 2 < l.stock)
    .sort((a, b) => b.leftover - a.leftover || a.sold - b.sold || byName(a, b))
    .slice(0, TOP)
    .map(({ stock: _stock, ...l }) => l);
  const mostRejected = goods
    .filter((l) => l.reject > 0)
    .sort((a, b) => b.reject - a.reject || byName(a, b))
    .slice(0, TOP);

  for (const type of Object.keys(revenueByType) as ProductType[]) revenueByType[type] /= 100;

  return {
    revenue: revenueC / 100,
    equipmentCharge: equipmentC / 100,
    sold,
    delivery,
    reject,
    rejectValue: rejectValueC / 100,
    leftover,
    leftoverValue: leftoverValueC / 100,
    sellThrough: countedStock > 0 ? countedSold / countedStock : null,
    revenueByType,
    uncounted: uncounted.sort(byName),
    overCounted: overCounted.sort((a, b) => a.sold - b.sold),
    equipmentMissing: [...equipmentMissing.values()].sort((a, b) => b.sold - a.sold),
    bestSellers,
    slowMovers,
    mostRejected,
  };
}
