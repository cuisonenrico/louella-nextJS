import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ProductionService } from './production.service';
import { FakeStockDb, day } from '../common/testing/fake-stock-db';

/**
 * Production yields and the material consumption they drive, tested on
 * outcomes: the stored yield, `used` on each stock card, and the carried
 * openings — not on which mocked call received what.
 */
describe('ProductionService', () => {
  let db: FakeStockDb & {
    recipe: { findMany: jest.Mock };
    unitConversion: { findMany: jest.Mock };
  };
  let service: ProductionService;

  const DATE = day('2026-09-08');
  const FLOUR = { id: 3, name: 'Flour', unit: 'KG' };
  const SUGAR = { id: 4, name: 'Sugar', unit: 'KG' };

  /** Product 2 uses 2 kg flour per piece; product 5 uses 1 kg sugar per piece. */
  const recipes = [
    {
      productId: 2,
      recipeYield: 1,
      recipeItems: [{ quantity: 2, unit: 'KG', material: FLOUR }],
    },
    {
      productId: 5,
      recipeYield: 1,
      recipeItems: [{ quantity: 1, unit: 'KG', material: SUGAR }],
    },
  ];

  beforeEach(() => {
    db = Object.assign(new FakeStockDb(), {
      recipe: {
        findMany: jest.fn(async ({ where }: { where: { productId: { in: number[] } } }) =>
          recipes.filter((r) => where.productId.in.includes(r.productId)),
        ),
      },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    });
    service = new ProductionService(db as never, {} as never);
  });

  const used = (materialId: number, date = DATE) =>
    db.live('materialInventory', { materialId, date })[0]?.used ?? 0;
  const yieldOf = (productId: number, date = DATE, branchId = 1) =>
    db.live('production', { productId, date, branchId })[0]?.yield;

  describe('saving yields', () => {
    it('consumes materials for a new yield', async () => {
      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 });

      expect(yieldOf(2)).toBe(10);
      expect(used(FLOUR.id)).toBe(20);
    });

    it('consumes only the difference when a yield is changed', async () => {
      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 });
      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 12 });

      expect(used(FLOUR.id)).toBe(24);
    });

    it('is safe to resend: the same save twice consumes once', async () => {
      const row = { productId: 2, date: '2026-09-08', yield: 10 };
      await service.upsertBulk([row]);
      await service.upsertBulk([row]);

      expect(used(FLOUR.id)).toBe(20);
    });

    it('charges a key listed twice in one batch only for its final yield', async () => {
      await service.upsertBulk([
        { productId: 2, date: '2026-09-08', yield: 10 },
        { productId: 2, date: '2026-09-08', yield: 15 },
      ]);

      expect(yieldOf(2)).toBe(15);
      expect(used(FLOUR.id)).toBe(30);
    });

    it('books sheet rows without a branch to the production kitchen', async () => {
      await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 3 }]);

      expect(yieldOf(2, DATE, 1)).toBe(3);
    });

    it('restores a deleted stock card that production consumes from', async () => {
      db.seed('materialInventory', {
        materialId: FLOUR.id, date: DATE, deletedAt: new Date(),
      });

      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 5 });

      expect(used(FLOUR.id)).toBe(10);
    });

    it('lowers later cards’ opening stock (carry-forward)', async () => {
      db.seed('materialInventory', { materialId: FLOUR.id, date: DATE, quantity: 100 });
      db.seed('materialInventory', { materialId: FLOUR.id, date: day('2026-09-09'), quantity: 100 });

      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 });

      expect(db.live('materialInventory').map((c) => c.quantity)).toEqual([100, 80]);
    });

    it('locks the production key before the material chains', async () => {
      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 });

      const kinds = db.locks.map((l) => l.split(':')[0]);
      expect(kinds[0]).toBe('1'); // production
      expect(kinds).toContain('2'); // material
      expect(kinds.lastIndexOf('1')).toBeLessThan(kinds.indexOf('2'));
    });

    it('asks only for live recipes', async () => {
      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 1 });

      expect(db.recipe.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: { in: [2] }, deletedAt: null },
        }),
      );
    });
  });

  describe('unit conversion', () => {
    const gramRecipe = {
      productId: 2,
      recipeYield: 1,
      recipeItems: [{ quantity: 500, unit: 'G', material: FLOUR }],
    };

    it('converts the recipe unit into the material unit', async () => {
      db.recipe.findMany.mockResolvedValue([gramRecipe]);
      db.unitConversion.findMany.mockResolvedValue([
        { fromUnit: 'G', toUnit: 'KG', factor: 0.001 },
      ]);

      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 });

      expect(used(FLOUR.id)).toBeCloseTo(5);
    });

    it('refuses to save when no conversion exists, and writes nothing', async () => {
      // The old fallback booked 10 × 500 = 5000 "kg" of flour here.
      db.recipe.findMany.mockResolvedValue([gramRecipe]);

      await expect(
        service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 }),
      ).rejects.toThrow(/No unit conversion defined for G→KG \(Flour\)/);
      expect(db.live('production')).toHaveLength(0);
      expect(db.live('materialInventory')).toHaveLength(0);
    });
  });

  describe('editing and deleting', () => {
    beforeEach(async () => {
      await service.create({ branchId: 1, productId: 2, date: '2026-09-08', yield: 10 });
    });
    const rowId = () => db.live('production')[0].id;

    it('moves consumption with a yield change', async () => {
      await service.update(rowId(), { yield: 4 });

      expect(used(FLOUR.id)).toBe(8);
    });

    // Re-keying used to leave the original consumption in place.
    it('hands materials back to the old product and day when re-keyed', async () => {
      await service.update(rowId(), { productId: 5, date: '2026-09-09' });

      expect(used(FLOUR.id)).toBe(0);
      expect(used(SUGAR.id, day('2026-09-09'))).toBe(10);
    });

    it('refuses an edit outside the caller’s branch', async () => {
      await expect(service.update(rowId(), { yield: 1 }, 99)).rejects.toThrow(
        NotFoundException,
      );
      expect(used(FLOUR.id)).toBe(20);
    });

    // A blanket catch used to report every failure as "not found".
    it('lets a real error through instead of calling it not found', async () => {
      db.recipe.findMany.mockRejectedValueOnce(new UnprocessableEntityException('boom'));

      await expect(service.update(rowId(), { yield: 4 })).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(used(FLOUR.id)).toBe(20); // rolled back
    });

    it('returns the materials when a row is deleted', async () => {
      await service.remove(rowId());

      expect(used(FLOUR.id)).toBe(0);
      expect(db.live('production')).toHaveLength(0);
    });
  });

  describe('addOrderYield (production-order finalization)', () => {
    it('adds to the kitchen yield rather than replacing it', async () => {
      await service.addOrderYield(db as never, DATE, [{ productId: 2, quantity: 30 }], 42);
      await service.addOrderYield(db as never, DATE, [{ productId: 2, quantity: 20 }], 42);

      expect(yieldOf(2)).toBe(50);
      expect(db.live('production')[0].createdById).toBe(42);
    });

    it('consumes materials for the added quantity', async () => {
      await service.addOrderYield(db as never, DATE, [{ productId: 2, quantity: 30 }]);

      expect(used(FLOUR.id)).toBe(60);
    });

    it('skips zero-quantity lines entirely', async () => {
      await service.addOrderYield(db as never, DATE, [{ productId: 2, quantity: 0 }]);

      expect(db.live('production')).toHaveLength(0);
      expect(db.live('materialInventory')).toHaveLength(0);
    });
  });
});
