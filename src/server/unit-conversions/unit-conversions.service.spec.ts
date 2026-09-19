import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { UnitConversionsService } from './unit-conversions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UnitConversionsService.remove', () => {
  let service: UnitConversionsService;
  const prisma = {
    unitConversion: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    recipeItem: { findMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.unitConversion.findUnique.mockResolvedValue({
      id: 1,
      fromUnit: 'KG',
      toUnit: 'G',
      factor: 1000,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitConversionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(UnitConversionsService);
  });

  // Deleting a conversion a live recipe relies on used to make consumption
  // silently fall back to factor 1 — a thousandfold error for grams vs kilos.
  it('refuses while a live recipe mixes the two units, in either direction', async () => {
    prisma.recipeItem.findMany.mockResolvedValue([
      { material: { name: 'Flour' }, recipe: { product: { name: 'Pandesal' } } },
    ]);

    await expect(service.remove(1)).rejects.toThrow(ConflictException);
    await expect(service.remove(1)).rejects.toThrow(/Pandesal \/ Flour/);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    expect(prisma.recipeItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          recipe: { deletedAt: null },
          OR: [
            { unit: 'KG', material: { unit: 'G' } },
            { unit: 'G', material: { unit: 'KG' } },
          ],
        },
      }),
    );
  });

  it('removes both directions when nothing depends on it', async () => {
    prisma.recipeItem.findMany.mockResolvedValue([]);

    await service.remove(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
