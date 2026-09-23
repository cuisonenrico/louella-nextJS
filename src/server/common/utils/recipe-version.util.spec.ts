import { materialPriceOn, recipeOn } from './recipe-version.util';
import { ProductionAnalyticsService } from '../../production/production-analytics.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const v = (version: number, from: string, retired = false) =>
  ({ version, effectiveFrom: day(from), retired, recipeYield: 1, items: [] }) as never;

describe('recipeOn', () => {
  const versions = [v(1, '2026-09-01'), v(2, '2026-09-10'), v(3, '2026-09-20', true)];

  it('picks the latest version effective on or before the day', () => {
    expect(recipeOn(versions, day('2026-09-05'))).toEqual(expect.objectContaining({ version: 1 }));
    expect(recipeOn(versions, day('2026-09-10'))).toEqual(expect.objectContaining({ version: 2 }));
    expect(recipeOn(versions, day('2026-09-19'))).toEqual(expect.objectContaining({ version: 2 }));
  });

  it('uses the first version for a day before any existed', () => {
    expect(recipeOn(versions, day('2026-08-01'))).toEqual(expect.objectContaining({ version: 1 }));
  });

  it('returns nothing from the day a recipe was retired', () => {
    expect(recipeOn(versions, day('2026-09-20'))).toBeNull();
    expect(recipeOn(versions, day('2026-12-01'))).toBeNull();
  });

  it('lets the later of two same-day versions win', () => {
    expect(recipeOn([v(1, '2026-09-01'), v(2, '2026-09-01')], day('2026-09-01'))).toEqual(
      expect.objectContaining({ version: 2 }),
    );
  });

  it('returns nothing for a product without a recipe', () => {
    expect(recipeOn(undefined, day('2026-09-01'))).toBeNull();
  });
});

describe('materialPriceOn', () => {
  const flour = { id: 3, pricePerUnit: { toNumber: () => 60 } };
  const prices = new Map([
    [3, [
      { price: 40, effectiveAt: day('2026-09-01') },
      { price: 50, effectiveAt: day('2026-09-10') },
    ]],
  ]);

  it('uses the price in force that day, not today’s', () => {
    expect(materialPriceOn(flour, day('2026-09-05'), prices)).toBe(40);
    expect(materialPriceOn(flour, day('2026-09-15'), prices)).toBe(50);
  });

  it('falls back to the current price only with no history at all', () => {
    expect(materialPriceOn(flour, day('2026-09-05'), new Map())).toBe(60);
  });
});

describe('ProductionAnalyticsService.getMaterialConsumption — cost as of the day', () => {
  it('costs a past day with that day’s recipe version and material price', async () => {
    const flour = { id: 3, name: 'Flour', unit: 'KG', pricePerUnit: { toNumber: () => 60 } };
    const prisma = {
      production: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1, productId: 2, yield: 10, date: day('2026-09-05'),
          product: { name: 'Pandesal' },
        }),
      },
      recipeVersion: {
        findMany: jest.fn().mockResolvedValue([
          { version: 1, effectiveFrom: day('2026-09-01'), retired: false, recipeYield: 1,
            recipe: { productId: 2 }, items: [{ materialId: 3, quantity: 2, unit: 'KG', material: flour }] },
          { version: 2, effectiveFrom: day('2026-09-10'), retired: false, recipeYield: 1,
            recipe: { productId: 2 }, items: [{ materialId: 3, quantity: 3, unit: 'KG', material: flour }] },
        ]),
      },
      materialPriceHistory: {
        findMany: jest.fn().mockResolvedValue([
          { materialId: 3, pricePerUnit: { toNumber: () => 40 }, effectiveAt: day('2026-09-01') },
          { materialId: 3, pricePerUnit: { toNumber: () => 60 }, effectiveAt: day('2026-09-10') },
        ]),
      },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ProductionAnalyticsService(prisma as never);

    const result = await service.getMaterialConsumption(1);

    // v1 (2 kg/piece) at ₱40, not v2 (3 kg) at today's ₱60.
    expect(result.recipeVersion).toBe(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ consumed: 20, pricePerUnit: 40, totalCost: 800 }),
    );
    expect(result.totalMaterialCost).toBe(800);
  });

  // It ignored branch scope, so a branch-limited user could read any
  // branch's production cost by guessing ids.
  it('scopes the lookup to the caller’s branch', async () => {
    const prisma = {
      production: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProductionAnalyticsService(prisma as never);

    await expect(service.getMaterialConsumption(1, undefined, 4)).rejects.toThrow(
      'Production record not found',
    );
    expect(prisma.production.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, branchId: 4 } }),
    );
  });
});
