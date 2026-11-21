import { describe, expect, it } from 'vitest';
import type { Inventory, Product } from '@/types';
import { summarizeSheet } from './sheetSummary';

let nextId = 1;
const inv = (o: Partial<Inventory> = {}): Inventory => ({
  id: nextId++,
  branchId: 1,
  productId: 1,
  createdById: null,
  quantity: 0,
  delivery: 10,
  leftover: 0,
  reject: 0,
  date: '2026-11-21',
  notes: null,
  createdAt: '',
  updatedAt: '',
  adjustments: [],
  effectivePrice: 10,
  leftoverCountedAt: '2026-11-21T10:00:00Z',
  ...o,
});

const product = (id: number, name: string, o: Partial<Product> = {}) =>
  ({ id, name, type: 'BREAD', price: 10, isEquipment: false, ...o }) as Product;

const catalog = new Map<number, Product>([
  [1, product(1, 'Pandesal')],
  [2, product(2, 'Ensaymada', { type: 'SPECIAL' })],
  [3, product(3, 'Spanish Bread')],
  [9, product(9, 'Trays', { type: 'MISCELLANEOUS', price: 130, isEquipment: true })],
]);

const summarize = (rows: Inventory[], pending = new Map(), rankByRevenue = true) =>
  summarizeSheet(rows, pending, catalog, { rankByRevenue });

describe('summarizeSheet', () => {
  it('totals a day: sales, pieces, rejects and leftover at their prices', () => {
    const s = summarize([
      inv({ productId: 1, delivery: 20, leftover: 4, reject: 1, effectivePrice: 5 }), // 15 sold
      inv({ productId: 2, delivery: 10, leftover: 2, effectivePrice: 30 }), // 8 sold
    ]);
    expect(s).toMatchObject({
      revenue: 15 * 5 + 8 * 30,
      sold: 23,
      delivery: 30,
      reject: 1,
      rejectValue: 5,
      leftover: 6,
      leftoverValue: 4 * 5 + 2 * 30,
    });
    expect(s.revenueByType).toMatchObject({ BREAD: 75, SPECIAL: 240 });
    // 23 sold of 23 + 1 + 6 on hand.
    expect(s.sellThrough).toBeCloseTo(23 / 30);
    expect(s.bestSellers.map((l) => l.name)).toEqual(['Ensaymada', 'Pandesal']);
  });

  it('applies unsaved edits, like the rows do', () => {
    const row = inv({ productId: 1, delivery: 10, leftover: 5 });
    const s = summarize([row], new Map([[row.id, { leftover: 1 }]]));
    expect(s.sold).toBe(9);
  });

  it('lists uncounted rows and leaves them out of sell-through and slow movers', () => {
    const s = summarize([
      inv({ productId: 1, delivery: 10, leftover: 5 }),
      inv({ productId: 3, delivery: 40, leftoverCountedAt: null }),
    ]);
    expect(s.uncounted.map((l) => l.name)).toEqual(['Spanish Bread']);
    expect(s.sellThrough).toBeCloseTo(5 / 10);
    expect(s.slowMovers).toEqual([]);
  });

  it('flags a row whose leftover and rejects exceed the stock', () => {
    const s = summarize([inv({ productId: 1, delivery: 4, leftover: 5, reject: 1 })]);
    expect(s.overCounted).toEqual([expect.objectContaining({ name: 'Pandesal', sold: -2 })]);
    // Flagged there, not counted as a slow mover or in sell-through.
    expect(s.slowMovers).toEqual([]);
    expect(s.sellThrough).toBeNull();
  });

  it('slow movers are counted products that sold under half their stock, most left over first', () => {
    const s = summarize([
      inv({ productId: 1, delivery: 10, leftover: 6 }), // sold 4 of 10
      inv({ productId: 2, delivery: 10, leftover: 3 }), // sold 7 of 10: fine
      inv({ productId: 3, delivery: 20, leftover: 20 }), // sold none
    ]);
    expect(s.slowMovers.map((l) => l.name)).toEqual(['Spanish Bread', 'Pandesal']);
  });

  it('over a range, leftover is what is on hand on the last day, not a sum', () => {
    const s = summarize([
      inv({ productId: 1, date: '2026-11-20', delivery: 10, leftover: 4 }),
      inv({ productId: 1, date: '2026-11-21', quantity: 4, delivery: 10, leftover: 3 }),
    ]);
    expect(s.leftover).toBe(3);
    expect(s.sold).toBe(6 + 11);
    // 17 sold of 17 + 0 + 3.
    expect(s.sellThrough).toBeCloseTo(17 / 20);
  });

  it('names the branch when the sheet covers several', () => {
    const s = summarize([
      inv({ branchId: 1, branch: { name: 'Solano' } as Inventory['branch'], productId: 3, leftoverCountedAt: null }),
      inv({ branchId: 2, branch: { name: 'Bambang' } as Inventory['branch'], productId: 1 }),
    ]);
    expect(s.uncounted).toEqual([expect.objectContaining({ name: 'Spanish Bread', branchName: 'Solano' })]);
  });

  it('keeps equipment out of pieces and rankings but charges missing pieces in sales', () => {
    const s = summarize([
      inv({ productId: 1, delivery: 10, leftover: 0 }),
      inv({ productId: 9, quantity: 51, delivery: 0, leftover: 49, effectivePrice: 130 }),
    ]);
    expect(s.sold).toBe(10);
    expect(s.equipmentCharge).toBe(260);
    expect(s.revenue).toBe(100 + 260);
    expect(s.equipmentMissing).toEqual([expect.objectContaining({ name: 'Trays', sold: 2 })]);
    expect(s.bestSellers.map((l) => l.name)).toEqual(['Pandesal']);
  });

  it('ranks by pieces when revenue is hidden', () => {
    const s = summarize(
      [inv({ productId: 1, delivery: 20, effectivePrice: 5 }), inv({ productId: 2, delivery: 5, effectivePrice: 30 })],
      new Map(),
      false,
    );
    expect(s.bestSellers.map((l) => l.name)).toEqual(['Pandesal', 'Ensaymada']);
  });
});
