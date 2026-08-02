/**
 * Canonical inventory "sold" math, shared so the formula lives in exactly one
 * place. Mirrors the frontend's getSold/getAdjSum helpers.
 *
 *   adjSum = Σ(PULL_IN ? +value : -value)
 *   sold   = quantity + delivery + adjSum - leftover - reject
 *
 * Rejects (spoiled/burnt units) are never counted as sold — they are waste,
 * not revenue. This matches the production efficiency report's definition.
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
