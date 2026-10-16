import type { Inventory, Product } from '@/types';
import { computeAdjSum, computeSold, computeTotalStock } from './metrics';

/** The three figures a person types on the sheet. */
export type CountFields = { delivery?: number; leftover?: number; reject?: number };

export interface RowFigures {
  /** Nobody has counted the leftover, and nothing typed counts it either. */
  uncounted: boolean;
  delivery: number;
  leftover: number;
  reject: number;
  adjSum: number;
  /** On hand: opening + delivery + Σadj. */
  totalStock: number;
  sold: number;
  price: number;
  revenue: number;
  /** On hand at that day's price. */
  stockValue: number;
}

/**
 * Every figure a sheet row shows, with unsaved edits applied.
 *
 * One definition for the desktop grid and the phone list. An uncounted row
 * mirrors the server: its close is derived from the stock on hand, so it books
 * nothing as sold until someone types a leftover.
 */
export function rowFigures(inv: Inventory, pending: CountFields | undefined, product: Product | undefined): RowFigures {
  const merged = pending ? { ...inv, ...pending } : inv;
  const uncounted = inv.leftoverCountedAt === null && pending?.leftover === undefined;
  const reject = merged.reject ?? 0;
  const totalStock = computeTotalStock(merged);
  const leftover = uncounted ? totalStock - reject : merged.leftover;
  const sold = computeSold({ ...merged, leftover });
  const price = inv.effectivePrice ?? product?.price ?? 0;
  return {
    uncounted,
    delivery: merged.delivery,
    leftover,
    reject,
    adjSum: computeAdjSum(merged.adjustments),
    totalStock,
    sold,
    price,
    revenue: sold * price,
    stockValue: totalStock * price,
  };
}
