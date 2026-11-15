import { describe, expect, it } from 'vitest';
import type { Inventory, Product } from '@/types';
import { rowFigures } from './rowFigures';

const inv = (o: Partial<Inventory> = {}): Inventory => ({
  id: 1,
  branchId: 1,
  productId: 1,
  createdById: null,
  quantity: 10,
  delivery: 30,
  leftover: 0,
  reject: 2,
  date: '2026-10-16',
  notes: null,
  createdAt: '',
  updatedAt: '',
  adjustments: [],
  effectivePrice: 5,
  leftoverCountedAt: '2026-10-16T10:00:00Z',
  ...o,
});

describe('rowFigures', () => {
  it('counted row: sold = qty + delivery + adj − leftover − reject', () => {
    const f = rowFigures(inv({ leftover: 8 }), undefined, undefined);
    expect(f).toMatchObject({ uncounted: false, totalStock: 40, sold: 30, revenue: 150, stockValue: 200 });
  });

  it('uncounted row derives leftover = on hand − reject and sells nothing', () => {
    const f = rowFigures(inv({ leftoverCountedAt: null }), undefined, undefined);
    expect(f).toMatchObject({ uncounted: true, leftover: 38, sold: 0, revenue: 0 });
  });

  describe('equipment', () => {
    const trays = { id: 1, name: 'Trays', type: 'MISCELLANEOUS', price: 130, isEquipment: true } as Product;
    const carried = inv({ quantity: 51, delivery: 0, reject: 0, leftover: 51, leftoverCountedAt: null, effectivePrice: 130 });

    it('a day nobody counted carries the count and is not flagged', () => {
      const f = rowFigures(carried, undefined, trays);
      expect(f).toMatchObject({ equipment: true, uncounted: false, leftover: 51, sold: 0 });
    });

    it('a lower count is missing, charged at its price', () => {
      const f = rowFigures(carried, { leftover: 49 }, trays);
      expect(f).toMatchObject({ equipment: true, sold: 2, revenue: 260 });
    });
  });

  it('a pending leftover counts the row', () => {
    const f = rowFigures(inv({ leftoverCountedAt: null }), { leftover: 5 }, undefined);
    expect(f).toMatchObject({ uncounted: false, leftover: 5, sold: 33 });
  });

  it('a pending delivery changes on hand and stock value', () => {
    expect(rowFigures(inv(), { delivery: 20 }, undefined)).toMatchObject({ totalStock: 30, stockValue: 150 });
  });

  it('falls back to product price when effectivePrice is missing', () => {
    const p = { id: 1, price: 4 } as Product;
    expect(rowFigures(inv({ effectivePrice: undefined }), undefined, p).price).toBe(4);
  });
});
