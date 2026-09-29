import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryAdjustmentsService } from './inventory-adjustments.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma(): Record<string, any> {
  const prisma: Record<string, any> = {
    inventory: {
      findFirst: jest.fn(),
      // Carry-forward reads the touched rows' keys; none here, so it no-ops.
      // Its effect on the chain is covered in inventory.chain.spec.ts.
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventoryAdjustment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // Chain locks (pg_advisory_xact_lock); ordering is covered on FakeStockDb.
    $executeRaw: jest.fn().mockResolvedValue(1),
    // Change history; its contents are covered in audit.util.spec.ts.
    auditEvent: { createMany: jest.fn() },
    // Interactive form, as the service uses it: the callback gets the client.
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as unknown[]),
    ),
  };
  return prisma;
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
    leftover: 0,
    reject: 0,
    leftoverCountedAt: null,
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

  // ─────────────────────────────────────────────────────────────────────────
  // update — stock cap
  //
  // create() caps a PULL_OUT at the stock on hand. update() did not, so the cap
  // was one PATCH away from being irrelevant.
  // ─────────────────────────────────────────────────────────────────────────

  describe('update — pull-out stock cap', () => {
    /** A standalone PULL_OUT of 5 against inventory row 9. */
    const pullOut = (overrides: Record<string, unknown> = {}) => ({
      id: 1,
      inventoryId: 9,
      type: 'PULL_OUT',
      value: 5,
      linkedAdjustmentId: null,
      inventory: { branchId: 1 },
      ...overrides,
    });

    it('refuses raising a pull-out above the stock on hand', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(pullOut());
      prisma.inventory.findFirst.mockResolvedValue({
        quantity: 100,
        delivery: 20,
        leftover: 0,
        reject: 0,
        leftoverCountedAt: null,
        adjustments: [{ type: 'PULL_OUT', value: 5 }],
      });

      await expect(
        service.update(1, { value: 200 }, unscoped()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.inventoryAdjustment.update).not.toHaveBeenCalled();
    });

    it('allows raising a pull-out that still fits the stock on hand', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(pullOut());
      prisma.inventory.findFirst.mockResolvedValue({
        quantity: 100,
        delivery: 20,
        leftover: 0,
        reject: 0,
        leftoverCountedAt: null,
        adjustments: [{ type: 'PULL_OUT', value: 5 }],
      });
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1, value: 100 });

      await service.update(1, { value: 100 }, unscoped());

      expect(prisma.inventoryAdjustment.update).toHaveBeenCalled();
    });

    it('excludes the adjustment being edited from the stock it is checked against', async () => {
      // Row holds 10 units and the pull-out under edit already claims all 10.
      // Counting it against itself leaves 0 available and would refuse every
      // edit, including lowering the value.
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(
        pullOut({ value: 10 }),
      );
      prisma.inventory.findFirst.mockResolvedValue({
        quantity: 10,
        delivery: 0,
        leftover: 0,
        reject: 0,
        leftoverCountedAt: null,
        adjustments: [{ id: 1, type: 'PULL_OUT', value: 10 }],
      });
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1, value: 8 });

      await service.update(1, { value: 8 }, unscoped());

      expect(prisma.inventoryAdjustment.update).toHaveBeenCalled();
    });

    it('does not cap an ANOMALY, which records what already happened', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(
        pullOut({ type: 'ANOMALY' }),
      );
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1, value: 999 });

      await service.update(1, { value: 999 }, unscoped());

      expect(prisma.inventory.findFirst).not.toHaveBeenCalled();
      expect(prisma.inventoryAdjustment.update).toHaveBeenCalled();
    });

    it('counts rejects and a counted leftover against what can be pulled out', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue(pullOut());
      prisma.inventory.findFirst.mockResolvedValue({
        quantity: 100,
        delivery: 20,
        leftover: 90,
        reject: 10,
        leftoverCountedAt: new Date(),
        adjustments: [{ id: 1, type: 'PULL_OUT', value: 5 }],
      });

      // 120 on hand, 90 counted, 10 rejected: 20 can leave, not 21.
      await expect(
        service.update(1, { value: 21 }, unscoped()),
      ).rejects.toBeInstanceOf(BadRequestException);
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1, value: 20 });
      await expect(service.update(1, { value: 20 }, unscoped())).resolves.toBeDefined();
    });
  });

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
        data: { value: 3, updatedById: 1 },
      });
      // One transaction: the edit and the carry-forward it triggers.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('refuses to change either leg of an accepted transfer', async () => {
      for (const leg of [
        { id: 1, type: 'PULL_OUT', transferStatus: 'ACCEPTED', linkedAdjustmentId: 2 },
        { id: 2, type: 'PULL_IN', transferStatus: 'ACCEPTED', linkedAdjustmentId: 1 },
        // Pre-acceptance transfers: linked, no status.
        { id: 3, type: 'PULL_OUT', transferStatus: null, linkedAdjustmentId: 4 },
      ]) {
        prisma.inventoryAdjustment.findFirst.mockResolvedValue({
          ...leg,
          value: 5,
          inventory: { branchId: 1 },
        });
        await expect(
          service.update(leg.id, { value: 8 }, unscoped()),
        ).rejects.toBeInstanceOf(ConflictException);
      }
      expect(prisma.inventoryAdjustment.update).not.toHaveBeenCalled();
      expect(prisma.inventoryAdjustment.updateMany).not.toHaveBeenCalled();
    });

    it('records the edit and its author', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        type: 'PULL_IN',
        value: 5,
        transferStatus: null,
        linkedAdjustmentId: null,
        inventory: { branchId: 1 },
      });
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1, type: 'PULL_IN', value: 3 });

      await service.update(1, { value: 3 }, unscoped());

      expect(prisma.auditEvent.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ entity: 'InventoryAdjustment', entityId: 1, action: 'update', userId: 1 })],
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
        data: { deletedAt: expect.any(Date), updatedById: 1 },
      });
      expect(prisma.auditEvent.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ entity: 'InventoryAdjustment', entityId: 1, action: 'delete', userId: 1 })],
      });
    });

    it('refuses to delete an accepted transfer', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        transferStatus: 'ACCEPTED',
        linkedAdjustmentId: 2,
        inventory: { branchId: 1 },
      });

      await expect(service.remove(1, unscoped())).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.inventoryAdjustment.update).not.toHaveBeenCalled();
      expect(prisma.inventoryAdjustment.updateMany).not.toHaveBeenCalled();
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
      prisma.inventoryAdjustment.create.mockResolvedValue({ id: 1 });

      await expect(service.transfer(dto, scoped(1))).resolves.toEqual({
        pullOut: { id: 1 },
        pullIn: null,
        status: 'PENDING',
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
      // Checked inside the locked transaction; no leg written.
      expect(prisma.inventoryAdjustment.create).not.toHaveBeenCalled();
    });

    // The receiver must confirm (decision 2026-09-19): sending books only the
    // sender's leg. The destination is credited on accept.
    it('books only the sender’s pull-out, marked pending, pointing at the destination', async () => {
      mockEnds(makeInvRow(), makeInvRow({ id: 2, branchId: 2 }));
      prisma.inventory.findFirst.mockResolvedValueOnce(makeInvRow());
      prisma.inventoryAdjustment.create.mockResolvedValue({ id: 11 });

      const result = await service.transfer(dto, unscoped());

      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledTimes(1);
      expect(prisma.inventoryAdjustment.create).toHaveBeenCalledWith({
        data: {
          inventoryId: 1,
          type: 'PULL_OUT',
          value: 10,
          notes: 'cover Cubao',
          createdById: 1,
          transferStatus: 'PENDING',
          transferToInventoryId: 2,
        },
      });
      expect(result).toEqual({ pullOut: { id: 11 }, pullIn: null, status: 'PENDING' });
    });
  });

  describe('audit trail', () => {
    it('records who revised an adjustment', async () => {
      prisma.inventoryAdjustment.findFirst.mockResolvedValue({
        id: 1,
        inventoryId: 9,
        type: 'PULL_IN',
        value: 5,
        linkedAdjustmentId: null,
        inventory: { branchId: 1 },
      });
      prisma.inventoryAdjustment.update.mockResolvedValue({ id: 1 });

      await service.update(1, { value: 3 }, unscoped());

      expect(prisma.inventoryAdjustment.update.mock.calls[0][0].data.updatedById).toBe(1);
    });
  });
});
