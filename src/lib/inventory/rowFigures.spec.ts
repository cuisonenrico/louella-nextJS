import { describe, expect, it } from 'vitest';
import type { Inventory, Product } from '@/types';
import { pesoValue, rowFigures } from './rowFigures';

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

  it('prices delivery, leftover and reject at the Stock ₱ price', () => {
    // Buns Big: ₱38, 15 delivered → ₱570
    const f = rowFigures(inv({ delivery: 15, leftover: 3, reject: 1, effectivePrice: 38 }), undefined, undefined);
    expect(f.stockValue / f.totalStock).toBe(38);
    expect(f).toMatchObject({ deliveryValue: 570, leftoverValue: 114, rejectValue: 38 });
  });

  it('peso values follow unsaved edits and an uncounted leftover', () => {
    expect(rowFigures(inv(), { delivery: 20, reject: 4 }, undefined)).toMatchObject({ deliveryValue: 100, rejectValue: 20 });
    // uncounted: leftover = 10 + 30 − 2 = 38
    expect(rowFigures(inv({ leftoverCountedAt: null }), undefined, undefined).leftoverValue).toBe(190);
  });

  it('no price at all prices everything at ₱0, never NaN', () => {
    const f = rowFigures(inv({ effectivePrice: undefined }), undefined, undefined);
    expect(f).toMatchObject({ deliveryValue: 0, leftoverValue: 0, rejectValue: 0 });
  });
});

describe('pesoValue', () => {
  it('multiplies to the centavo', () => {
    expect(pesoValue(3, 12.5)).toBe(37.5);
    expect(pesoValue(3, 0.1)).toBe(0.3);
  });

  it('treats a missing or bad quantity or price as 0', () => {
    expect(pesoValue(null, 38)).toBe(0);
    expect(pesoValue(undefined, 38)).toBe(0);
    expect(pesoValue(15, null)).toBe(0);
    expect(pesoValue(15, undefined)).toBe(0);
    expect(pesoValue(Number.NaN, 38)).toBe(0);
    expect(Object.is(pesoValue(-0, 38), 0)).toBe(true);
  });
});
