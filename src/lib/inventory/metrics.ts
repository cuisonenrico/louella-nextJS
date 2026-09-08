/**
 * Canonical inventory maths — the single definition, shared by the API and the
 * app.
 *
 *   adjSum = Σ(PULL_IN ? +value : -value)
 *   sold   = quantity + delivery + adjSum - leftover - reject
 *
 * Rejects (spoiled/burnt units) are never counted as sold: they are waste, not
 * revenue. This matches the production efficiency report's definition.
 *
 * This lived twice — once in `src/server/common/utils/inventory-metrics.util.ts`
 * and once as a hand-written "mirror" in the inventory sheet's column hook —
 * and the two had already drifted: the server defaulted a missing `reject` to
 * 0 while the mirror read it unguarded, so a row arriving without the field
 * turned sold, revenue and every total built on them into NaN. The API and the
 * app ship from one build, so there is no reason for two copies; the server
 * util now re-exports these, and the sheet imports them directly.
 */

export interface AdjustmentLike {
  type: string;
  value: number;
}

export interface SoldRowLike {
  quantity: number;
  delivery: number;
  leftover: number;
  reject?: number;
  adjustments?: AdjustmentLike[];
}

export interface MaterialClosingRowLike {
  quantity: number;
  delivery: number;
  used: number;
  adjustments?: AdjustmentLike[];
}

export function computeAdjSum(
  adjustments: AdjustmentLike[] | undefined,
): number {
  if (!adjustments) return 0;
  return adjustments.reduce(
    (acc, a) => acc + (a.type === 'PULL_IN' ? a.value : -a.value),
    0,
  );
}

export function computeSold(row: SoldRowLike): number {
  return (
    row.quantity +
    row.delivery +
    computeAdjSum(row.adjustments) -
    row.leftover -
    (row.reject ?? 0)
  );
}

/** Stock on hand before sales are deducted: opening + delivery + adjustments. */
export function computeTotalStock(row: SoldRowLike): number {
  return row.quantity + row.delivery + computeAdjSum(row.adjustments);
}

/**
 * Closing stock on a material card, and therefore the next day's opening:
 *
 *   closing = quantity + delivery + adjSum - used
 *
 * The adjSum term is the whole point. Materials have no counted "leftover"
 * column to fall back on — unlike finished goods, where the closing figure is
 * physically counted at end of day — so the card is the only record there is.
 * Leaving adjustments out meant a recorded spoilage or restock never reached
 * the next morning's opening balance, and the error compounded down the chain.
 *
 * Clamped at zero: a negative balance is a bookkeeping artefact, not stock that
 * can be issued, and carrying it forward would silently suppress the next day's
 * real deliveries.
 */
export function computeMaterialClosing(row: MaterialClosingRowLike): number {
  return Math.max(
    0,
    row.quantity + row.delivery + computeAdjSum(row.adjustments) - row.used,
  );
}
