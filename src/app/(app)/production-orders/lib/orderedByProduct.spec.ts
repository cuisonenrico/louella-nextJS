import { describe, expect, it } from 'vitest';
import type { ProductionOrder } from '@/types';
import { deliveryStatus, orderedByProduct } from './orderedByProduct';

const order = (status: ProductionOrder['status'], items: Array<[number, number]>) =>
  ({ id: Math.random(), status, items: items.map(([productId, y]) => ({ productId, yield: y })) }) as unknown as ProductionOrder;

describe('orderedByProduct', () => {
  it('adds up finalized orders only', () => {
    const m = orderedByProduct([
      order('FINALIZED', [[1, 100], [2, 5]]),
      order('FINALIZED', [[1, 50]]),
      order('DRAFT', [[1, 30]]),
      order('CANCELLED', [[2, 9]]),
    ]);
    expect(m.get(1)).toBe(150);
    expect(m.get(2)).toBe(5);
  });

  it('is empty without finalized orders', () => {
    expect(orderedByProduct([order('DRAFT', [[1, 3]])]).size).toBe(0);
  });
});

describe('deliveryStatus', () => {
  it.each([
    [22, 24, { kind: 'short', by: 2 }],
    [27, 24, { kind: 'over', by: 3 }],
    [24, 24, { kind: 'match' }],
    [5, undefined, { kind: 'none' }],
  ] as const)('delivery %s against ordered %s', (delivery, ordered, expected) => {
    expect(deliveryStatus(delivery, ordered)).toEqual(expected);
  });
});
