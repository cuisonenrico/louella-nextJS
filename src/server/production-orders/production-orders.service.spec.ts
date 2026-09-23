import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';

describe('ProductionOrdersService', () => {
  let service: ProductionOrdersService;
  let productionService: { addOrderYield: jest.Mock };
  let inventoryService: { addDeliveryInTx: jest.Mock };
  let prisma: {
    branch: { findFirst: jest.Mock };
    product: { findMany: jest.Mock };
    inventory: { findMany: jest.Mock; upsert: jest.Mock; createMany: jest.Mock };
    productionOrder: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
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
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      productionOrder: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      production: { upsert: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
          typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
        ),
    };

    productionService = { addOrderYield: jest.fn() };
    inventoryService = { addDeliveryInTx: jest.fn() };
    service = new ProductionOrdersService(
      prisma as never,
      productionService as never,
      inventoryService as never,
    );
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

  describe('finalization', () => {
    const DATE = new Date('2026-09-19T00:00:00.000Z');
    const draft = {
      id: 5,
      status: 'DRAFT',
      branchId: 2,
      date: DATE,
      items: [
        { productId: 1, yield: 50 },
        { productId: 2, yield: 0 },
      ],
    };

    beforeEach(() => {
      prisma.productionOrder.findFirst.mockResolvedValue(draft);
      prisma.productionOrder.update.mockResolvedValue({ ...draft, status: 'FINALIZED' });
    });

    it('adds the kitchen yield and the branch delivery instead of overwriting them', async () => {
      await service.update(5, { status: 'FINALIZED' } as never, undefined, 42);

      expect(productionService.addOrderYield).toHaveBeenCalledWith(
        prisma,
        DATE,
        [{ productId: 1, quantity: 50 }], // zero-quantity lines skipped
        42,
      );
      expect(inventoryService.addDeliveryInTx).toHaveBeenCalledTimes(1);
      expect(inventoryService.addDeliveryInTx).toHaveBeenCalledWith(
        prisma,
        { branchId: 2, productId: 1, date: DATE },
        50,
        42, // attributed in the change history
      );
      // The old path upserted Production/Inventory with `update: { yield }`.
      expect(prisma.production.upsert).not.toHaveBeenCalled();
      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
    });

    it('claims the DRAFT → FINALIZED transition atomically', async () => {
      await service.update(5, { status: 'FINALIZED' } as never);

      expect(prisma.productionOrder.updateMany).toHaveBeenCalledWith({
        where: { id: 5, status: 'DRAFT', deletedAt: null },
        data: { status: 'FINALIZED' },
      });
    });

    // Finalizing adds stock, so a second finalize racing the first must book
    // nothing. The status check before the transaction cannot stop it.
    it('books nothing when another request already finalized the order', async () => {
      prisma.productionOrder.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(5, { status: 'FINALIZED' } as never),
      ).rejects.toThrow(ConflictException);
      expect(productionService.addOrderYield).not.toHaveBeenCalled();
      expect(inventoryService.addDeliveryInTx).not.toHaveBeenCalled();
    });

    it('delivers to the branch the order has after this update', async () => {
      prisma.branch.findFirst.mockResolvedValue({ id: 3 });
      prisma.productionOrder.update.mockResolvedValue({
        ...draft,
        branchId: 3,
        status: 'FINALIZED',
      });

      await service.update(5, { status: 'FINALIZED', branchId: 3 } as never);

      expect(inventoryService.addDeliveryInTx).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ branchId: 3 }),
        50,
        undefined,
      );
    });

    it('books only the kitchen yield for an order with no branch', async () => {
      prisma.productionOrder.update.mockResolvedValue({
        ...draft,
        branchId: null,
        status: 'FINALIZED',
      });

      await service.update(5, { status: 'FINALIZED' } as never);

      expect(productionService.addOrderYield).toHaveBeenCalled();
      expect(inventoryService.addDeliveryInTx).not.toHaveBeenCalled();
    });

    it('books nothing on an ordinary edit', async () => {
      await service.update(5, { notes: 'more rolls' } as never);

      expect(prisma.productionOrder.updateMany).not.toHaveBeenCalled();
      expect(productionService.addOrderYield).not.toHaveBeenCalled();
    });
  });
});
