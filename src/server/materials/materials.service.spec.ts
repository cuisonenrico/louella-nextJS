import { ConflictException } from '@nestjs/common';
import { MaterialsService } from './materials.service';

describe('MaterialsService', () => {
  const flour = {
    id: 3,
    name: 'Flour',
    unit: 'KG',
    pricePerUnit: { toNumber: () => 60 },
    recipeItems: [],
    priceHistory: [],
  };
  let prisma: Record<string, any>;
  let service: MaterialsService;

  beforeEach(() => {
    prisma = {
      material: {
        create: jest.fn().mockResolvedValue({ id: 3 }),
        findFirst: jest.fn().mockResolvedValue(flour),
        update: jest.fn().mockResolvedValue(flour),
      },
      materialInventory: { count: jest.fn().mockResolvedValue(0) },
      recipeItem: { count: jest.fn().mockResolvedValue(0) },
      materialPriceHistory: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new MaterialsService(prisma as never);
  });

  afterEach(() => jest.useRealTimers());

  // Costing a past day reads the price in force then; without an opening row
  // the first price change would reprice every earlier day.
  it('records an opening price, effective today in Manila', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-09-18T22:30:00Z')); // 06:30 on the 19th

    await service.create({ name: 'Flour', unit: 'KG', pricePerUnit: 55 } as never);

    expect(prisma.material.create.mock.calls[0][0].data.priceHistory).toEqual({
      create: { pricePerUnit: 55, effectiveAt: new Date('2026-09-19T00:00:00.000Z') },
    });
  });

  it('dates a price change to the Manila day', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-09-19T02:00:00Z'));

    await service.update(3, { pricePerUnit: 65 } as never);

    expect(prisma.materialPriceHistory.create.mock.calls[0][0].data.effectiveAt).toEqual(
      new Date('2026-09-19T00:00:00.000Z'),
    );
  });

  describe('changing the stock unit', () => {
    it('is refused once stock has been recorded in the old unit', async () => {
      prisma.materialInventory.count.mockResolvedValue(4);

      await expect(service.update(3, { unit: 'G' } as never)).rejects.toThrow(ConflictException);
      expect(prisma.material.update).not.toHaveBeenCalled();
    });

    it('is refused once a recipe uses the material', async () => {
      prisma.recipeItem.count.mockResolvedValue(1);

      await expect(service.update(3, { unit: 'G' } as never)).rejects.toThrow(ConflictException);
    });

    it('is allowed on a material nothing uses yet', async () => {
      await service.update(3, { unit: 'G' } as never);

      expect(prisma.material.update).toHaveBeenCalled();
    });
  });
});
