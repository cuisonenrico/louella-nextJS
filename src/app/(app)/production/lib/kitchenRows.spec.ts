import { describe, expect, it } from 'vitest';
import type { Production } from '@/types';
import { kitchenRowsByProduct } from './kitchenRows';

const row = (id: number, branchId: number, productId: number, y: number) => ({ id, branchId, productId, yield: y }) as Production;

describe('kitchenRowsByProduct', () => {
  it('ignores the zero rows autofill leaves on other branches, whatever their order', () => {
    const m = kitchenRowsByProduct([row(13, 1, 23, 12), row(47, 2, 23, 0), row(71, 3, 23, 0)]);
    expect(m.get(23)?.id).toBe(13);
    const reversed = kitchenRowsByProduct([row(71, 3, 23, 0), row(47, 2, 23, 0), row(13, 1, 23, 12)]);
    expect(reversed.get(23)?.id).toBe(13);
  });

  it('with nothing baked anywhere, takes the lowest branch (the kitchen by default)', () => {
    expect(kitchenRowsByProduct([row(47, 2, 23, 0), row(13, 1, 23, 0)]).get(23)?.id).toBe(13);
  });
});
