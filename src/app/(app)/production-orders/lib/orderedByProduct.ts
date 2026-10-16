import type { ProductionOrder } from '@/types';

/**
 * What the kitchen was asked to send, per product: Σ item yield across the
 * day's finalized orders. Several orders for one product and day add up;
 * drafts and cancelled orders deliver nothing.
 */
export function orderedByProduct(orders: ProductionOrder[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const order of orders) {
    if (order.status !== 'FINALIZED') continue;
    for (const item of order.items) map.set(item.productId, (map.get(item.productId) ?? 0) + item.yield);
  }
  return map;
}

export type DeliveryStatus =
  | { kind: 'none' }
  | { kind: 'match' }
  | { kind: 'short'; by: number }
  | { kind: 'over'; by: number };

/** How the delivery on the sheet compares with what was ordered. */
export function deliveryStatus(delivery: number, ordered: number | undefined): DeliveryStatus {
  if (ordered === undefined) return { kind: 'none' };
  if (delivery === ordered) return { kind: 'match' };
  return delivery < ordered ? { kind: 'short', by: ordered - delivery } : { kind: 'over', by: delivery - ordered };
}
