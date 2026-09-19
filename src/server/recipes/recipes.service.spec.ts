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
});
