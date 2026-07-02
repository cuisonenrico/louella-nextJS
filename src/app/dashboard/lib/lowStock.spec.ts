import { describe, expect, it } from 'vitest';
import { severityPct, sortBySeverity, type LowStockEntry } from './lowStock';

function entry(over: Partial<LowStockEntry>): LowStockEntry {
  return { id: 1, name: 'Flour', unit: 'KG', currentStock: 5, reorderLevel: 10, ...over };
}

describe('severityPct', () => {
  it('returns stock as % of reorder level', () => {
    expect(severityPct(entry({ currentStock: 5, reorderLevel: 10 }))).toBe(50);
  });

  it('clamps to 100 when stock exceeds reorder level', () => {
    expect(severityPct(entry({ currentStock: 15, reorderLevel: 10 }))).toBe(100);
  });

  it('returns 0 when reorder level is 0 (no divide-by-zero)', () => {
    expect(severityPct(entry({ currentStock: 5, reorderLevel: 0 }))).toBe(0);
  });

  it('returns 0 when stock is 0', () => {
    expect(severityPct(entry({ currentStock: 0, reorderLevel: 10 }))).toBe(0);
  });
});

describe('sortBySeverity', () => {
  it('sorts worst (lowest %) first', () => {
    const items = [
      entry({ id: 1, name: 'Sugar', currentStock: 9, reorderLevel: 10 }),   // 90%
      entry({ id: 2, name: 'Flour', currentStock: 1, reorderLevel: 10 }),   // 10%
      entry({ id: 3, name: 'Yeast', currentStock: 5, reorderLevel: 10 }),   // 50%
    ];
    expect(sortBySeverity(items).map((i) => i.name)).toEqual(['Flour', 'Yeast', 'Sugar']);
  });

  it('breaks ties by name and does not mutate input', () => {
    const items = [
      entry({ id: 1, name: 'Yeast', currentStock: 5, reorderLevel: 10 }),
      entry({ id: 2, name: 'Butter', currentStock: 5, reorderLevel: 10 }),
    ];
    const sorted = sortBySeverity(items);
    expect(sorted.map((i) => i.name)).toEqual(['Butter', 'Yeast']);
    expect(items.map((i) => i.name)).toEqual(['Yeast', 'Butter']);
  });
});
