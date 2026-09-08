/**
 * Canonical inventory maths.
 *
 * The definitions live in `src/lib/inventory/metrics.ts` so the API and the app
 * share one copy — they ship from the same build, and the hand-written mirror
 * that used to sit in the sheet's column hook had already drifted from this
 * file. Re-exported here so every existing server import keeps working and the
 * server layer keeps its own stable path.
 */
export {
  computeAdjSum,
  computeMaterialClosing,
  computeSold,
  computeTotalStock,
  type AdjustmentLike,
  type MaterialClosingRowLike,
  type SoldRowLike,
} from '@/lib/inventory/metrics';
