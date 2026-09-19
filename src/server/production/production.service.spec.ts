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
    materialInventory: { upsert: jest.fn() },
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
    prisma.recipe.findFirst.mockResolvedValue({
      recipeYield: 1,
      recipeItems: [
        {
          materialId: 3,
          quantity: 2,
          unit: 'KG',
          material: { id: 3, name: 'Flour', unit: 'KG' },
        },
      ],
    });
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

    expect(prisma.recipe.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: 2, deletedAt: null },
      }),
    );
  });

  describe('unit conversion', () => {
    /** 500 G of a KG-stocked material per batch of 1. */
    function seedGramRecipe() {
      seedRecipe();
      prisma.recipe.findFirst.mockResolvedValue({
        recipeYield: 1,
        recipeItems: [
          {
            materialId: 3,
            quantity: 500,
            unit: 'G',
            material: { id: 3, name: 'Flour', unit: 'KG' },
          },
        ],
      });
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
});
