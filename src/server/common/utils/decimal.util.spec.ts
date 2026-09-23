import { Prisma } from '@prisma/client';
import { centavos, costCentavos, inverseFactor, num, pesos, q4 } from './decimal.util';
import { computeAdjSum, computeMaterialClosing } from './inventory-metrics.util';

describe('decimal helpers', () => {
  it('reads Decimals, numbers and nulls alike', () => {
    expect(num(new Prisma.Decimal('0.3333'))).toBe(0.3333);
    expect(num(2.5)).toBe(2.5);
    expect(num(null)).toBe(0);
  });

  it('rounds quantities to the 4 dp a card stores', () => {
    expect(q4(0.1 + 0.2)).toBe(0.3);
    expect(q4(2 / 3)).toBe(0.6667);
  });

  it('adds money in centavos, so the float residue never appears', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(pesos(centavos(0.1) + centavos(0.2))).toBe(0.3);
    expect(centavos(new Prisma.Decimal('12.35'))).toBe(1235);
  });

  it('costs a fractional quantity exactly and rounds once, half up', () => {
    // 0.125 kg at ₱0.3 = ₱0.0375 → 4 centavos (a double gives 3.7499…).
    expect(costCentavos(0.125, new Prisma.Decimal('0.3'))).toBe(4);
    expect(costCentavos(1.005, 1)).toBe(101);
  });

  it('keeps a conversion inverse at 9 dp', () => {
    expect(inverseFactor(3)).toBe(0.333333333);
    expect(inverseFactor(new Prisma.Decimal(1000))).toBe(0.001);
  });
});

describe('material maths on Decimal columns', () => {
  it('closes a card exactly, however many small moves it had', () => {
    const adjustments = Array.from({ length: 10 }, () => ({
      type: 'PULL_OUT',
      value: new Prisma.Decimal('0.1'),
    }));
    expect(computeAdjSum(adjustments)).toBe(-1);
    expect(
      computeMaterialClosing({
        quantity: new Prisma.Decimal('5.3'),
        delivery: new Prisma.Decimal('0.1'),
        used: new Prisma.Decimal('0.2'),
        adjustments,
      }),
    ).toBe(4.2);
  });
});

describe('material consumption writes 4 dp', () => {
  it('books a third of a kilo per piece as 0.3333, and edits never drift from entering the total at once', async () => {
    const { FakeStockDb, day } = await import('../testing/fake-stock-db');
    const { ProductionService } = await import('../../production/production.service');
    const flour = { id: 3, name: 'Flour', unit: 'KG' };
    const db = Object.assign(new FakeStockDb(), {
      recipeVersion: {
        findMany: jest.fn().mockResolvedValue([
          { version: 1, effectiveFrom: day('2026-01-01'), retired: false,
            recipeYield: new Prisma.Decimal(3), recipe: { productId: 2 },
            items: [{ materialId: 3, quantity: new Prisma.Decimal(1), unit: 'KG', material: flour }] },
        ]),
      },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    });
    const card = db.seed('materialInventory', { materialId: 3, date: day('2026-09-08'), quantity: 10 });
    const service = new ProductionService(db as never, {} as never);

    await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 1 }], 1);
    expect(db.tables.materialInventory.find((c) => c.id === card.id)!.used).toBe(0.3333);

    // 1 → 2 → 3 pieces is exactly 1 kg, as entering 3 at once would be —
    // not 3 × 0.3333.
    await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 2 }], 1);
    await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 3 }], 1);
    expect(db.tables.materialInventory.find((c) => c.id === card.id)!.used).toBe(1);

    await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 0 }], 1);
    expect(db.tables.materialInventory.find((c) => c.id === card.id)!.used).toBe(0);
  });
});
