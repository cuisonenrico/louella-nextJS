import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';

describe('ProductionOrdersService', () => {
  let service: ProductionOrdersService;
  let prisma: {
    branch: { findFirst: jest.Mock };
    product: { findMany: jest.Mock };
    inventory: { findMany: jest.Mock; upsert: jest.Mock };
    productionOrder: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    production: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      branch: { findFirst: jest.fn() },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      inventory: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      productionOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      production: { upsert: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
        ),
    };

    service = new ProductionOrdersService(prisma as never);
  });

  it('creates a production order with branchId when branch is active', async () => {
    prisma.branch.findFirst.mockResolvedValue({ id: 2 });
    prisma.productionOrder.create.mockResolvedValue({ id: 10, branchId: 2 });

    await service.create(
      {
        branchId: 2,
        date: '2026-05-18',
        notes: 'Branch order',
        items: [{ productId: 1, yield: 12 }],
      },
      99,
    );

    expect(prisma.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 2,
          createdById: 99,
        }),
      }),
    );
  });

  it('rejects create when branch is missing/inactive', async () => {
    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          branchId: 999,
          date: '2026-05-18',
          items: [{ productId: 1, yield: 1 }],
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters by branch in findByDate', async () => {
    prisma.productionOrder.findMany.mockResolvedValue([]);

    await service.findByDate('2026-05-18', 3);

    expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 3 }),
      }),
    );
  });

  it('aggregates planned yield by product and honors branch filter', async () => {
    prisma.productionOrder.findMany.mockResolvedValue([
      {
        items: [
          { productId: 1, yield: 10 },
          { productId: 2, yield: 4 },
        ],
      },
      { items: [{ productId: 1, yield: 6 }] },
    ]);

    const result = await service.getPlannedYieldByDate('2026-05-18', 2);

    expect(prisma.productionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: 2 }),
      }),
    );
    expect(result).toEqual(
      expect.arrayContaining([
        { productId: 1, plannedYield: 16 },
        { productId: 2, plannedYield: 4 },
      ]),
    );
  });

  describe('branch scoping on by-id routes', () => {
    it('findOne scopes the lookup to the given branch', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue(null);
      await expect(service.findOne(5, 3)).rejects.toThrow(NotFoundException);
      expect(prisma.productionOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 5,
            deletedAt: null,
            branchId: 3,
          }),
        }),
      );
    });

    it('findOne does not filter by branch when no scope is given', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue(null);
      await expect(service.findOne(5)).rejects.toThrow(NotFoundException);
      const where = prisma.productionOrder.findFirst.mock.calls[0][0].where;
      expect(where.branchId).toBeUndefined();
    });

    it('update refuses an order outside the branch scope', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue(null);
      await expect(service.update(5, { notes: 'x' }, 3)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('remove refuses an order outside the branch scope', async () => {
      prisma.productionOrder.findFirst.mockResolvedValue(null);
      await expect(service.remove(5, 3)).rejects.toThrow(NotFoundException);
    });
  });
});
