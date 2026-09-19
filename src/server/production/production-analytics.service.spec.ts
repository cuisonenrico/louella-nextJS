import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductionAnalyticsService } from './production-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeSold } from '../common/utils/inventory-metrics.util';

const PANDESAL = { name: 'Pandesal', type: 'BREAD' };

type Row = {
  productId: number;
  branchId: number;
  quantity: number;
  delivery: number;
  leftover: number;
  reject: number;
  adjustments: Array<{ type: string; value: number }>;
  product: typeof PANDESAL;
};
const row = (r: Partial<Row>): Row => ({
  productId: 1,
  branchId: 1,
  quantity: 0,
  delivery: 0,
  leftover: 0,
  reject: 0,
  adjustments: [],
  product: PANDESAL,
  ...r,
});

describe('ProductionAnalyticsService.getEfficiency', () => {
  let service: ProductionAnalyticsService;
  const prisma = {
    production: { findMany: jest.fn() },
    inventory: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.production.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionAnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ProductionAnalyticsService);
  });

  /**
   * Three days, one branch. 20 carried in, 100 delivered on day 1, 5 moved in
   * on day 2, 30 left on day 3. Rows are date-ascending, as the query orders.
   */
  const threeDays = [
    row({ quantity: 20, delivery: 100, leftover: 40, reject: 2 }),
    row({ quantity: 40, delivery: 0, leftover: 25, reject: 1, adjustments: [{ type: 'PULL_IN', value: 5 }] }),
    row({ quantity: 25, delivery: 60, leftover: 30, reject: 3 }),
  ];

  it('agrees with the canonical sold formula, opening stock and transfers included', async () => {
    prisma.inventory.findMany.mockResolvedValue(threeDays);

    const [item] = await service.getEfficiency('2026-09-01', '2026-09-03');

    const expectedSold = threeDays.reduce((s, r) => s + computeSold(r), 0);
    expect(item.sold).toBe(expectedSold);
    // The old formula (Σdelivery − Σleftover − Σreject) gave 160 − 95 − 6 = 59.
    expect(item.sold).toBe(149); // 78 + 19 + 52
  });

  it('counts leftover once, as the stock still on hand at the end', async () => {
    prisma.inventory.findMany.mockResolvedValue(threeDays);

    const [item] = await service.getEfficiency('2026-09-01', '2026-09-03');

    expect(item.openingStock).toBe(20);
    expect(item.closingStock).toBe(30); // not 40 + 25 + 30
    expect(item.netAdjustments).toBe(5);
    // Every unit is sold, rejected, or still on hand.
    expect(item.available).toBe(item.sold + item.totalReject + item.closingStock);
    // …which is also what came in: opening + deliveries + transfers.
    expect(item.available).toBe(20 + 160 + 5);
  });

  it('treats only rejects as waste', async () => {
    prisma.inventory.findMany.mockResolvedValue(threeDays);

    const [item] = await service.getEfficiency('2026-09-01', '2026-09-03');

    expect(item.wasteRate).toBeCloseTo(6 / 185, 4);
    expect(item.soldRate).toBeCloseTo(149 / 185, 4);
  });

  it('opens and closes each branch separately', async () => {
    prisma.inventory.findMany.mockResolvedValue([
      row({ branchId: 1, quantity: 10, delivery: 50, leftover: 8 }),
      row({ branchId: 2, quantity: 4, delivery: 30, leftover: 6 }),
      row({ branchId: 1, quantity: 8, delivery: 50, leftover: 5 }),
      row({ branchId: 2, quantity: 6, delivery: 30, leftover: 2 }),
    ]);

    const [item] = await service.getEfficiency('2026-09-01', '2026-09-02');

    expect(item.openingStock).toBe(14);
    expect(item.closingStock).toBe(7);
  });

  it('excludes soft-deleted inventory rows', async () => {
    prisma.inventory.findMany.mockResolvedValue([]);

    await service.getEfficiency('2026-09-01', '2026-09-03');

    expect(prisma.inventory.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });

  it('drops products with nothing produced and nothing on hand', async () => {
    prisma.production.findMany.mockResolvedValue([
      { productId: 1, yield: 0, product: PANDESAL },
      { productId: 2, yield: 50, product: { name: 'Ensaymada', type: 'BREAD' } },
    ]);
    prisma.inventory.findMany.mockResolvedValue([row({ productId: 1 })]);

    const items = await service.getEfficiency('2026-09-01', '2026-09-01');

    expect(items.map((i) => i.productId)).toEqual([2]);
  });

  it('refuses an unbounded range', async () => {
    await expect(
      service.getEfficiency('2025-01-01', '2026-09-01'),
    ).rejects.toThrow(BadRequestException);
  });
});
