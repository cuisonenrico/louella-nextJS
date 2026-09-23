/**
 * Canonical inventory maths.
 *
 * The definitions live in `src/lib/inventory/metrics.ts` so the API and the app
 * share one copy — they ship from the same build, and the hand-written mirror
 * that used to sit in the sheet's column hook had already drifted from this
 * file. Re-exported here so every existing server import keeps working and the
 * server layer keeps its own stable path.
 *
 * Material figures are `numeric` columns, so Prisma hands them over as
 * Decimals. The wrappers below take either form, and round material results to
 * the column's 4 dp so float residue never reaches a stored card.
 */
import {
  computeAdjSum as adjSum,
  computeMaterialClosing as materialClosing,
} from '@/lib/inventory/metrics';
import { num, q4, type Numeric } from './decimal.util';

export {
  computeSold,
  computeTotalStock,
  type AdjustmentLike,
  type MaterialClosingRowLike,
  type SoldRowLike,
} from '@/lib/inventory/metrics';

export interface NumericAdjustment {
  type: string;
  value: Numeric;
}

export interface NumericMaterialRow {
  quantity: Numeric;
  delivery: Numeric;
  used: Numeric;
  adjustments?: NumericAdjustment[];
}

const plainAdjustments = (adjustments: NumericAdjustment[] | undefined) =>
  adjustments?.map((a) => ({ type: a.type, value: num(a.value) }));

/** Net adjustment (PULL_IN − PULL_OUT). Exact to 4 dp for material values. */
export function computeAdjSum(adjustments: NumericAdjustment[] | undefined): number {
  return q4(adjSum(plainAdjustments(adjustments)));
}

/** A material card's close — the next day's opening — rounded to 4 dp. */
export function computeMaterialClosing(row: NumericMaterialRow): number {
  return q4(
    materialClosing({
      quantity: num(row.quantity),
      delivery: num(row.delivery),
      used: num(row.used),
      adjustments: plainAdjustments(row.adjustments),
    }),
  );
}
