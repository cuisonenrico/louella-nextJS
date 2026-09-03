/**
 * Canonical material stock math for the frontend, mirroring the backend's
 * `quantity + delivery - used + adjDelta` (materials.service.ts,
 * dashboard.service.ts) and the shared `computeAdjSum` sign convention.
 *
 * The stock card used to compute closing without adjustments, so a pull-out
 * entered on the card never showed on it — while the dashboard's low-stock
 * figures for the same material and day did include it. One formula, here.
 */
import type { MaterialAdjustment } from '@/types';

/** Σ(PULL_IN ? +value : -value). Values are stored positive; type carries the sign. */
export function getMaterialAdjSum(
  adjustments: MaterialAdjustment[] | undefined,
): number {
  return (adjustments ?? []).reduce(
    (acc, a) => acc + (a.type === 'PULL_IN' ? a.value : -a.value),
    0,
  );
}

/** Closing stock for one material-day. Never negative, matching the backend. */
export function getMaterialClosing(row: {
  quantity: number;
  used: number;
  adjustments?: MaterialAdjustment[];
}, delivery: number): number {
  return Math.max(
    0,
    row.quantity + delivery - row.used + getMaterialAdjSum(row.adjustments),
  );
}
