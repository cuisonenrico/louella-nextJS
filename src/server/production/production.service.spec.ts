import { Test, TestingModule } from '@nestjs/testing';
import { ProductionService } from './production.service';
import { ProductionAnalyticsService } from './production-analytics.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma() {
  const prisma: Record<string, any> = {
    production: { upsert: jest.fn(), findUnique: jest.fn() },
    recipe: { findFirst: jest.fn(), findMany: jest.fn() },
    unitConversion: { findMany: jest.fn() },
    materialInventory: {
      upsert: jest.fn(),
      // Carry-forward's reads: no earlier or later cards in these tests.
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  // Interactive form only — ProductionService.create uses the callback shape.
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.resolve([]),
  );
  return prisma;
}

describe('ProductionService material consumption', () => {
  let service: ProductionService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: PrismaService, useValue: prisma },
        { provide: ProductionAnalyticsService, useValue: {} },
      ],
    }).compile();
    service = module.get(ProductionService);
  });

  afterEach(() => jest.clearAllMocks());

  /** One product, one recipe line: 2 KG of material 3 per batch of 1. */
  function seedRecipe() {
    prisma.production.findUnique.mockResolvedValue(null);
    prisma.production.upsert.mockResolvedValue({ id: 1 });
    prisma.recipe.findMany.mockResolvedValue([{
      productId: 2,
      recipeYield: 1,
      recipeItems: [
        {
          materialId: 3,
          quantity: 2,
          unit: 'KG',
          material: { id: 3, name: 'Flour', unit: 'KG' },
        },
      ],
    }]);
    prisma.unitConversion.findMany.mockResolvedValue([]);
    prisma.materialInventory.upsert.mockResolvedValue({ id: 5 });
  }

  it('restores a deleted stock card that production consumes from', async () => {
    // Material stock cards are soft-deleted now. The unique key ignores
    // deletedAt, so this upsert lands on a deleted card — and the consumption
    // it records would be invisible on every stock sheet unless the write
    // revives the card it is writing to.
    seedRecipe();

    await service.create({
      branchId: 1,
      productId: 2,
      date: '2026-09-08',
      yield: 10,
    } as never);

    const args = prisma.materialInventory.upsert.mock.calls[0][0];
    expect(args.update.deletedAt).toBeNull();
  });

  it('still increments used by the consumed amount', async () => {
    seedRecipe();

    await service.create({
      branchId: 1,
      productId: 2,
      date: '2026-09-08',
      yield: 10,
    } as never);

    const args = prisma.materialInventory.upsert.mock.calls[0][0];
    expect(args.update.used).toEqual({ increment: 20 });
  });

  it('ignores a soft-deleted recipe', async () => {
    seedRecipe();

    await service.create({
      branchId: 1,
      productId: 2,
      date: '2026-09-08',
      yield: 10,
    } as never);

    expect(prisma.recipe.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: { in: [2] }, deletedAt: null },
      }),
    );
  });

  describe('unit conversion', () => {
    /** 500 G of a KG-stocked material per batch of 1. */
    function seedGramRecipe() {
      seedRecipe();
      prisma.recipe.findMany.mockResolvedValue([{
        productId: 2,
        recipeYield: 1,
        recipeItems: [
          {
            materialId: 3,
            quantity: 500,
            unit: 'G',
            material: { id: 3, name: 'Flour', unit: 'KG' },
          },
        ],
      }]);
    }

    it('converts the recipe unit into the material unit', async () => {
      seedGramRecipe();
      prisma.unitConversion.findMany.mockResolvedValue([
        { fromUnit: 'G', toUnit: 'KG', factor: 0.001 },
      ]);

      await service.create({
        branchId: 1,
        productId: 2,
        date: '2026-09-08',
        yield: 10,
      } as never);

      const args = prisma.materialInventory.upsert.mock.calls[0][0];
      // 10 batches × 500 g = 5 kg
      expect(args.update.used.increment).toBeCloseTo(5);
    });

    it('refuses to save when no conversion exists, instead of assuming 1', async () => {
      // The old fallback booked 10 × 500 = 5000 "kg" of flour here.
      seedGramRecipe();
      prisma.unitConversion.findMany.mockResolvedValue([]);

      await expect(
        service.create({
          branchId: 1,
          productId: 2,
          date: '2026-09-08',
          yield: 10,
        } as never),
      ).rejects.toThrow(/No unit conversion defined for G→KG \(Flour\)/);
      expect(prisma.materialInventory.upsert).not.toHaveBeenCalled();
    });
  });

  describe('addOrderYield (production-order finalization)', () => {
    const DATE = new Date('2026-09-19T00:00:00.000Z');

    it('adds to the kitchen yield rather than replacing it', async () => {
      seedRecipe();

      await service.addOrderYield(prisma as never, DATE, [{ productId: 2, quantity: 30 }], 42);

      const args = prisma.production.upsert.mock.calls[0][0];
      expect(args.where.branchId_productId_date).toEqual({
        branchId: 1,
        productId: 2,
        date: DATE,
      });
      expect(args.update.yield).toEqual({ increment: 30 });
      expect(args.create).toEqual(
        expect.objectContaining({ yield: 30, createdById: 42, isAutoGenerated: false }),
      );
    });

    // Finalization never consumed materials before.
    it('consumes materials for the added quantity', async () => {
      seedRecipe();

      await service.addOrderYield(prisma as never, DATE, [{ productId: 2, quantity: 30 }]);

      const card = prisma.materialInventory.upsert.mock.calls[0][0];
      expect(card.where.materialId_date).toEqual({ materialId: 3, date: DATE });
      expect(card.update.used).toEqual({ increment: 60 }); // 30 × 2 kg
    });

    it('skips zero-quantity lines entirely', async () => {
      seedRecipe();

      await service.addOrderYield(prisma as never, DATE, [{ productId: 2, quantity: 0 }]);

      expect(prisma.production.upsert).not.toHaveBeenCalled();
      expect(prisma.materialInventory.upsert).not.toHaveBeenCalled();
    });
  });
});
