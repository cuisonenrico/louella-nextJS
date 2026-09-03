import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    inventory: {
      findFirst: jest.fn(),
    },
    inventoryAdjustment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A user scoped to one branch: no `all-branches`, a branchId assigned. */
const scoped = (branchId: number) => ({
  id: 7,
  branchId,
  permissions: ['inventory-adjustments'],
});

/** A user who may see every branch, matching ROLE_DEFAULTS for ADMIN/INVENTORY. */
const unscoped = () => ({
  id: 1,
  branchId: null,
  permissions: ['inventory-adjustments', 'all-branches'],
});

function makeInvRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    branchId: 1,
    productId: 5,
    date: new Date('2026-09-02'),
    quantity: 100,
    delivery: 20,
    adjustments: [],
    ...overrides,
  };
}

describe('InventoryAdjustmentsService', () => {
  let service: InventoryAdjustmentsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryAdjustmentsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InventoryAdjustmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      inventoryId: 1,
      type: 'PULL_IN' as const,
      value: 5,
      notes: 'extra batch',
    };

    it('rejects an unknown inventory record', async () => {
      prisma.inventory.findFirst.mockResolvedValue(null);
      await expect(service.create(dto, unscoped())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('stamps the calling user as the author', async () => {
      prisma.inventory.findFirst.mockResolvedValue(makeInvRow());
      prisma.inventoryAdjustment.create.mockResolvedValue({ id: 9 });

      await service.create(dto, unscoped());

      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: { ...dto, createdById: 1 },
      });
    });

    it('refuses a branch the caller is not scoped to', async () => {
      prisma.inventory.findFirst.mockResolvedValue(makeInvRow({ branchId: 2 }));

      await expect(service.create(dto, scoped(1))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
    });

    it('allows the caller their own branch', async () => {
      prisma.inventory.findFirst.mockResolvedValue(makeInvRow({ branchId: 1 }));
      prisma.inventoryAdjustment.create.mockResolvedValue({ id: 9 });

      await expect(service.create(dto, scoped(1))).resolves.toEqual({ id: 9 });
    });

    it('denies a scoped caller with no branch assigned rather than falling through', async () => {
      prisma.inventory.findFirst.mockResolvedValue(makeInvRow());

      await expect(
        service.create(dto, { id: 3, branchId: null, permissions: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a pull-out larger than the stock on hand', async () => {
      prisma.inventory.findFirst.mockResolvedValue(
        makeInvRow({ quantity: 10, delivery: 5 }),
      );

      await expect(
        service.create(
          { inventoryId: 1, type: 'PULL_OUT', value: 20 },
          unscoped(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
    });

    it('counts existing adjustments towards what is available', async () => {
      // 10 + 5 on the card, less a 12-unit pull-out already recorded, leaves 3.
      prisma.inventory.findFirst.mockResolvedValue(
        makeInvRow({
          quantity: 10,
          delivery: 5,
          adjustments: [{ type: 'PULL_OUT', value: 12 }],
        }),
      );

      await expect(
        service.create(
          { inventoryId: 1, type: 'PULL_OUT', value: 4 },
          unscoped(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('leaves anomalies uncapped — they record what already happened', async () => {
      prisma.inventory.findFirst.mockResolvedValue(
        makeInvRow({ quantity: 1, delivery: 0 }),
      );
      prisma.inventoryAdjustment.create.mockResolvedValue({ id: 9 });

      await expect(
        service.create(
          { inventoryId: 1, type: 'ANOMALY', value: 500 },
          unscoped(),
        ),
      ).resolves.toEqual({ id: 9 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // findByInventory
  // ─────────────────────────────────────────────────────────────────────────

  describe('findByInventory', () => {
    it('excludes soft-deleted adjustments', async () => {
      prisma.inventory.findFirst.mockResolvedValue({ branchId: 1 });
      prisma.inventoryAdjustment.findMany.mockResolvedValue([]);

      await service.findByInventory(1, unscoped());

      expect(prisma.inventoryAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { inventoryId: 1, deletedAt: null },
        }),
      );
    });

    it('does not read another branch', async () => {
      prisma.inventory.findFirst.mockResolvedValue({ branchId: 2 });

      await expect(
        service.findByInventory(1, scoped(1)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('rejects an unknown adjustment', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(null);
      await expect(
        service.update(1, { value: 3 }, unscoped()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('edits a standalone adjustment directly', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        type: 'PULL_IN',
        value: 5,
        linkedAdjustmentId: null,
        inventory: { branchId: 1 },
      });
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1, value: 3 });

      await service.update(1, { value: 3 }, unscoped());

      expect(prisma.inventoryAdjustment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { value: 3 },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to re-type one leg of a transfer', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        type: 'PULL_OUT',
        value: 5,
        linkedAdjustmentId: 2,
        inventory: { branchId: 1 },
      });

      await expect(
        service.update(1, { type: 'PULL_IN' }, unscoped()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryAdjustment.update).not.toHaveBeenCalled();
    });

    it('mirrors a changed value onto the transfer counterpart', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        type: 'PULL_OUT',
        value: 5,
        linkedAdjustmentId: 2,
        inventory: { branchId: 1 },
      });
      prisma.$transaction.mockResolvedValue([{ id: 1, value: 8 }, { count: 1 }]);

      await service.update(1, { value: 8 }, unscoped());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.inventoryAdjustment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { value: 8 },
      });
      expect(prisma.inventoryAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 2, deletedAt: null },
        data: { value: 8 },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // remove
  // ─────────────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes rather than hard-deletes', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        linkedAdjustmentId: null,
        inventory: { branchId: 1 },
      });
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1 });

      await service.remove(1, unscoped());

      expect(prisma.inventoryAdjustment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('deletes both legs of a transfer together', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        linkedAdjustmentId: 2,
        inventory: { branchId: 1 },
      });
      prisma.$transaction.mockResolvedValue([{ id: 1 }, { count: 1 }]);

      await service.remove(1, unscoped());

      // Leaving the counterpart live would invent stock at the other branch.
      expect(prisma.inventoryAdjustment.updateMany).toHaveBeenCalledWith({
        where: { id: 2, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refuses to delete another branch’s adjustment', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        linkedAdjustmentId: null,
        inventory: { branchId: 2 },
      });

      await expect(service.remove(1, scoped(1))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.inventoryAdjustment.update).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // transfer
  // ─────────────────────────────────────────────────────────────────────────

  describe('transfer', () => {
    const dto = {
      fromInventoryId: 1,
      toInventoryId: 2,
      value: 10,
      notes: 'cover Cubao',
    };

    function mockEnds(
      from: Record<string, unknown> | null,
      to: Record<string, unknown> | null,
    ) {
      prisma.inventory.findFirst
        .mockResolvedValueOnce(from)
        .mockResolvedValueOnce(to);
    }

    it('rejects a missing source', async () => {
      mockEnds(null, makeInvRow({ id: 2, branchId: 2 }));
      await expect(service.transfer(dto, unscoped())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a missing destination', async () => {
      mockEnds(makeInvRow(), null);
      await expect(service.transfer(dto, unscoped())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects two different products', async () => {
      mockEnds(
        makeInvRow({ productId: 5 }),
        makeInvRow({ id: 2, branchId: 2, productId: 6 }),
      );
      await expect(service.transfer(dto, unscoped())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a transfer to the same branch', async () => {
      mockEnds(makeInvRow(), makeInvRow({ id: 2, branchId: 1 }));
      await expect(service.transfer(dto, unscoped())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects ends on different dates', async () => {
      mockEnds(
        makeInvRow({ date: new Date('2026-09-02') }),
        makeInvRow({ id: 2, branchId: 2, date: new Date('2026-09-03') }),
      );
      await expect(service.transfer(dto, unscoped())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to pull from a branch the caller does not own', async () => {
      mockEnds(
        makeInvRow({ branchId: 2 }),
        makeInvRow({ id: 2, branchId: 1 }),
      );
      await expect(service.transfer(dto, scoped(1))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('lets a branch-scoped caller push their own stock out', async () => {
      mockEnds(makeInvRow({ branchId: 1 }), makeInvRow({ id: 2, branchId: 2 }));
      // assertStockAvailable re-reads the source.
      prisma.inventory.findFirst.mockResolvedValueOnce(
        makeInvRow({ quantity: 100, delivery: 20 }),
      );
      prisma.$transaction.mockResolvedValue({
        pullOut: { id: 1 },
        pullIn: { id: 2 },
      });

      await expect(service.transfer(dto, scoped(1))).resolves.toEqual({
        pullOut: { id: 1 },
        pullIn: { id: 2 },
      });
    });

    it('refuses to move more units than the source holds', async () => {
      mockEnds(makeInvRow(), makeInvRow({ id: 2, branchId: 2 }));
      prisma.inventory.findFirst.mockResolvedValueOnce(
        makeInvRow({ quantity: 3, delivery: 0 }),
      );

      await expect(service.transfer(dto, unscoped())).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes a linked, positive-valued pair in one transaction', async () => {
      mockEnds(makeInvRow(), makeInvRow({ id: 2, branchId: 2 }));
      prisma.inventory.findFirst.mockResolvedValueOnce(makeInvRow());

      const tx = {
        inventoryAdjustment: {
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 11 })
            .mockResolvedValueOnce({ id: 12 }),
          update: jest.fn().mockResolvedValue({ id: 11, linkedAdjustmentId: 12 }),
        },
      };
      prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
        fn(tx),
      );

      const result = await service.transfer(dto, unscoped());

      // Source leg: PULL_OUT, magnitude positive — the sign lives in the formula.
      expect(tx.inventoryAdjustment.create).toHaveBeenNthCalledWith(1, {
        data: {
          inventoryId: 1,
          type: 'PULL_OUT',
          value: 10,
          notes: 'cover Cubao',
          createdById: 1,
        },
      });
      // Destination leg: PULL_IN, also positive, pointing back at the source.
      expect(tx.inventoryAdjustment.create).toHaveBeenNthCalledWith(2, {
        data: {
          inventoryId: 2,
          type: 'PULL_IN',
          value: 10,
          notes: 'cover Cubao',
          linkedAdjustmentId: 11,
          createdById: 1,
        },
      });
      // And the link is closed in the other direction.
      expect(tx.inventoryAdjustment.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { linkedAdjustmentId: 12 },
      });
      expect(result).toEqual({
        pullOut: { id: 11, linkedAdjustmentId: 12 },
        pullIn: { id: 12 },
      });
    });
  });
});
