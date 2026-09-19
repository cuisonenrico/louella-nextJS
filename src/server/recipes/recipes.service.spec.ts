import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RecipesService } from './recipes.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  const prisma: Record<string, any> = {
    recipe: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 7 }),
      // What snapshot() copies into a version: the recipe as it now stands.
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 7,
        recipeYield: 12,
        recipeItems: [{ materialId: 3, quantity: 2, unit: 'KG' }],
      }),
    },
    recipeVersion: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    recipeItem: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    material: { findMany: jest.fn() },
    unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

const FLOUR = { id: 3, name: 'Flour', unit: 'KG' };

describe('RecipesService', () => {
  let service: RecipesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecipesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RecipesService);
    prisma.material.findMany.mockResolvedValue([FLOUR]);
  });

  const body = (unit = 'KG') =>
    ({
      productId: 2,
      recipeYield: 12,
      items: [{ materialId: 3, quantity: 2, unit }],
    }) as never;

  describe('create', () => {
    it('refuses when a live recipe already exists', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null });

      await expect(service.create(body())).rejects.toThrow(ConflictException);
      expect(prisma.recipe.create).not.toHaveBeenCalled();
    });

    it('creates a new recipe when none exists', async () => {
      prisma.recipe.findFirst.mockResolvedValue(null);

      await service.create(body());

      expect(prisma.recipe.create).toHaveBeenCalled();
      expect(prisma.recipe.update).not.toHaveBeenCalled();
    });

    // Recipe.productId is unique and the delete is soft, so inserting here
    // used to hit P2002: a deleted recipe blocked the product forever.
    it('revives a soft-deleted recipe instead of inserting a duplicate', async () => {
      prisma.recipe.findFirst.mockResolvedValue({
        id: 7,
        deletedAt: new Date('2026-09-01'),
      });

      await service.create(body());

      expect(prisma.recipe.create).not.toHaveBeenCalled();
      expect(prisma.recipeItem.deleteMany).toHaveBeenCalledWith({
        where: { recipeId: 7 },
      });
      const args = prisma.recipe.update.mock.calls[0][0];
      expect(args.where).toEqual({ id: 7 });
      expect(args.data.deletedAt).toBeNull();
      expect(args.data.recipeYield).toBe(12);
      expect(args.data.recipeItems.create).toEqual([
        { materialId: 3, quantity: 2, unit: 'KG' },
      ]);
    });

    it('looks up the product slot including deleted recipes', async () => {
      prisma.recipe.findFirst.mockResolvedValue(null);

      await service.create(body());

      expect(prisma.recipe.findFirst).toHaveBeenCalledWith({
        where: { productId: 2 },
      });
    });
  });

  describe('unit conversion check', () => {
    beforeEach(() => prisma.recipe.findFirst.mockResolvedValue(null));

    it('accepts an ingredient in the material’s own unit without a lookup row', async () => {
      await service.create(body('KG'));
      expect(prisma.recipe.create).toHaveBeenCalled();
    });

    it('accepts an ingredient whose unit has a conversion', async () => {
      prisma.unitConversion.findMany.mockResolvedValue([
        { fromUnit: 'G', toUnit: 'KG', factor: 0.001 },
      ]);

      await service.create(body('G'));

      expect(prisma.recipe.create).toHaveBeenCalled();
    });

    it('refuses an ingredient whose unit cannot be converted, naming it', async () => {
      await expect(service.create(body('G'))).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.create(body('G'))).rejects.toThrow(
        /Flour \(G→KG\)/,
      );
      expect(prisma.recipe.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown or deleted material', async () => {
      prisma.material.findMany.mockResolvedValue([]);

      await expect(service.create(body())).rejects.toThrow(NotFoundException);
    });

    it('applies on update when items are replaced', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null });

      await expect(
        service.update(7, { items: [{ materialId: 3, quantity: 1, unit: 'G' }] } as never),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('is skipped on update when items are not being changed', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null });

      await service.update(7, { notes: 'x' } as never);

      expect(prisma.material.findMany).not.toHaveBeenCalled();
      expect(prisma.recipe.update).toHaveBeenCalled();
    });
  });

  describe('calculateCost', () => {
    it('refuses rather than cost an unconvertible ingredient at factor 1', async () => {
      prisma.recipe.findFirst.mockResolvedValue({
        id: 7,
        productId: 2,
        recipeYield: 1,
        product: { name: 'Pandesal', price: 5 },
        recipeItems: [
          {
            quantity: 500,
            unit: 'G',
            material: { ...FLOUR, pricePerUnit: { toNumber: () => 50 } },
          },
        ],
      });

      await expect(service.calculateCost(7)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  // Decision 2026-09-19: past days are consumed and costed with the recipe
  // in force on that day, so every change appends a version.
  describe('versions', () => {
    const versionArgs = () => prisma.recipeVersion.create.mock.calls.map(([a]: any) => a.data);

    it('writes version 1 when a recipe is created', async () => {
      prisma.recipe.findFirst.mockResolvedValue(null);

      await service.create(body());

      expect(versionArgs()).toEqual([
        expect.objectContaining({
          version: 1,
          recipeYield: 12,
          retired: false,
          items: { create: [{ materialId: 3, quantity: 2, unit: 'KG' }] },
        }),
      ]);
    });

    it('dates a version to today in Manila', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date('2026-09-18T22:30:00Z')); // 06:30 on the 19th
      prisma.recipe.findFirst.mockResolvedValue(null);

      await service.create(body());

      jest.useRealTimers();
      expect(versionArgs()[0].effectiveFrom).toEqual(new Date('2026-09-19T00:00:00.000Z'));
    });

    it('appends the next version when ingredients change', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null, recipeYield: 12 });
      prisma.recipeVersion.findFirst.mockResolvedValue({ version: 3 });

      await service.update(7, { items: [{ materialId: 3, quantity: 5, unit: 'KG' }] } as never);

      expect(versionArgs()).toEqual([expect.objectContaining({ version: 4 })]);
    });

    it('appends a version when only the yield changes', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null, recipeYield: 12 });

      await service.update(7, { recipeYield: 24 } as never);

      expect(versionArgs()).toHaveLength(1);
    });

    it('does not version a notes-only edit', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null, recipeYield: 12 });

      await service.update(7, { notes: 'use bread flour' } as never);

      expect(versionArgs()).toHaveLength(0);
    });

    it('retires the recipe from today when it is deleted', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: null });
      prisma.recipeVersion.findFirst.mockResolvedValue({ version: 2 });

      await service.remove(7);

      expect(versionArgs()).toEqual([
        expect.objectContaining({ version: 3, retired: true, items: undefined }),
      ]);
    });

    it('starts a new active version when a deleted recipe is revived', async () => {
      prisma.recipe.findFirst.mockResolvedValue({ id: 7, deletedAt: new Date('2026-09-01') });
      prisma.recipeVersion.findFirst.mockResolvedValue({ version: 3 });

      await service.create(body());

      expect(versionArgs()).toEqual([expect.objectContaining({ version: 4, retired: false })]);
    });
  });
});
