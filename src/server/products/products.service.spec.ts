import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService price history', () => {
  let service: ProductsService;
  const prisma = {
    product: {
      aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      findFirst: jest.fn(),
    },
    productPriceHistory: { create: jest.fn() },
    $transaction: jest.fn((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : undefined,
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ProductsService);
  });

  afterEach(() => jest.useRealTimers());

  // Without an opening row, the first price change revalued every earlier
  // sale of the product at the new price.
  it('creates an opening price row effective from the launch date', async () => {
    await service.create({ name: 'Ube Roll', price: 25, date: '2026-09-01' } as never);

    const { data } = prisma.product.create.mock.calls[0][0];
    expect(data.priceHistory).toEqual({
      create: { price: 25, effectiveAt: new Date('2026-09-01T00:00:00.000Z') },
    });
  });

  it('dates the opening row to today in Manila when no launch date is given', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    // 06:30 on the 19th in Manila; still the 18th in UTC.
    jest.setSystemTime(new Date('2026-09-18T22:30:00Z'));

    await service.create({ name: 'Ube Roll', price: 25 } as never);

    const { data } = prisma.product.create.mock.calls[0][0];
    expect(data.priceHistory.create.effectiveAt).toEqual(
      new Date('2026-09-19T00:00:00.000Z'),
    );
  });

  it('writes an opening row for every product in a bulk create', async () => {
    await service.createBulk([
      { name: 'A', price: 5 },
      { name: 'B', price: 7 },
    ] as never);

    const rows = prisma.product.create.mock.calls.map(
      ([arg]) => arg.data.priceHistory.create.price,
    );
    expect(rows).toEqual([5, 7]);
  });

  describe('price change', () => {
    beforeEach(() => {
      prisma.product.findFirst.mockResolvedValue({
        id: 1,
        price: { toNumber: () => 25 },
      });
    });

    it('dates the change to the Manila day, so it applies from that day', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      jest.setSystemTime(new Date('2026-09-19T02:00:00Z')); // 10:00 Manila

      await service.update(1, { price: 28 } as never);

      const { data } = prisma.productPriceHistory.create.mock.calls[0][0];
      // Midnight of the day, comparable with Inventory.date — not 02:00Z,
      // which sorted after the day's rows and deferred the change a day.
      expect(data.effectiveAt).toEqual(new Date('2026-09-19T00:00:00.000Z'));
    });

    it('honours an explicit effective date', async () => {
      await service.update(1, { price: 28, priceEffectiveAt: '2026-10-01' } as never);

      const { data } = prisma.productPriceHistory.create.mock.calls[0][0];
      expect(data.effectiveAt).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    });
  });
});
