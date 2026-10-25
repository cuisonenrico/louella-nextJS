import type { Production } from '@/types';

/**
 * One production row per product: the kitchen's.
 *
 * `GET /production/date` returns rows for every branch — the on-demand autofill
 * leaves zero-yield rows on branches that never bake — and the client does not
 * know the kitchen's branch id (`PRODUCTION_BRANCH_ID` is server-side). Yield is
 * only ever booked to the kitchen, so its row is the one with yield; with
 * nothing baked anywhere, the lowest branch id (the kitchen by default).
 */
export function kitchenRowsByProduct(rows: Production[]): Map<number, Production> {
  const m = new Map<number, Production>();
  for (const r of rows) {
    const cur = m.get(r.productId);
    if (!cur || r.yield > cur.yield || (r.yield === cur.yield && r.branchId < cur.branchId)) m.set(r.productId, r);
  }
  return m;
}
