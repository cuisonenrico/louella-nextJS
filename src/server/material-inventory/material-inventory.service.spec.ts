import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MaterialInventoryService } from './material-inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { CACHE_NS } from '../common/cache/cache-namespaces';

function makePrisma() {
  return {
    materialInventory: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      createMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    material: { findMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  };
}

function makeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    wrap: jest.fn(
      async (
        ns: string,
        parts: (string | number)[],
        fn: () => Promise<unknown>,
      ) => {
        const key = `${ns}:${parts.join(':')}`;
        if (store.has(key)) return store.get(key);
        const val = await fn();
        store.set(key, val);
        return val;
      },
    ),
    bump: jest.fn((ns: string) => {
      for (const k of [...store.keys()])
        if (k.startsWith(`${ns}:`)) store.delete(k);
    }),
  };
}

describe('MaterialInventoryService caching', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;
  let cache: ReturnType<typeof makeCache>;

  beforeEach(async () => {
    prisma = makePrisma();
    cache = makeCache();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: cache },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  it('listDates computes once, then serves from cache', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([]);
    await service.listDates();
    await service.listDates();
    expect(prisma.materialInventory.findMany).toHaveBeenCalledTimes(1);
  });

  it('listDates recomputes after the material namespace is bumped', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([]);
    await service.listDates();
    cache.bump(CACHE_NS.MATERIAL_AGG);
    await service.listDates();
    expect(prisma.materialInventory.findMany).toHaveBeenCalledTimes(2);
  });

  it('getGaps computes once for identical args', async () => {
    prisma.material.findMany.mockResolvedValue([]);
    prisma.materialInventory.findMany.mockResolvedValue([]);
    await service.getGaps('2024-01-01', '2024-01-02');
    await service.getGaps('2024-01-01', '2024-01-02');
    expect(prisma.material.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('MaterialInventoryService.initDate carry-over', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: makeCache() },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  /**
   * Wire up "yesterday had one card for material 1" so initDate('2026-09-08')
   * has something to carry forward.
   */
  function seedPreviousDay(card: Record<string, unknown>) {
    prisma.materialInventory.findFirst.mockResolvedValue({
      date: new Date('2026-09-07T00:00:00.000Z'),
    });
    prisma.materialInventory.findMany
      .mockResolvedValueOnce([card]) // previous day's records
      .mockResolvedValueOnce([]); // rows already on the target date
    prisma.materialInventory.createMany.mockResolvedValue({ count: 1 });
  }

  const openingOf = () =>
    prisma.materialInventory.createMany.mock.calls[0][0].data[0].quantity;

  it('carries opening + delivery - used forward', async () => {
    prisma.material.findMany.mockResolvedValue([{ id: 1 }]);
    seedPreviousDay({
      materialId: 1,
      quantity: 50,
      delivery: 25,
      used: 30,
      adjustments: [],
    });

    await service.initDate('2026-09-08');

    expect(openingOf()).toBe(45);
  });

  it('subtracts a recorded spoilage from the next day opening stock', async () => {
    prisma.material.findMany.mockResolvedValue([{ id: 1 }]);
    seedPreviousDay({
      materialId: 1,
      quantity: 50,
      delivery: 0,
      used: 0,
      adjustments: [{ type: 'ANOMALY', value: 20 }],
    });

    await service.initDate('2026-09-08');

    expect(openingOf()).toBe(30);
  });

  it('reads the previous day adjustments, ignoring soft-deleted ones', async () => {
    prisma.material.findMany.mockResolvedValue([{ id: 1 }]);
    seedPreviousDay({
      materialId: 1,
      quantity: 10,
      delivery: 0,
      used: 0,
      adjustments: [],
    });

    await service.initDate('2026-09-08');

    const prevQuery = prisma.materialInventory.findMany.mock.calls[0][0];
    expect(prevQuery.include).toEqual({
      adjustments: { where: { deletedAt: null } },
    });
  });
});

// ---------------------------------------------------------------------------
// Soft delete
//
// MaterialInventory was the one operational model that hard-deleted, and
// MaterialAdjustment cascades off it — so removing a stock card destroyed its
// adjustment history outright. AGENTS.md: no operational record is ever
// hard-deleted by application code.
// ---------------------------------------------------------------------------

describe('MaterialInventoryService soft delete', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: makeCache() },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('stamps deletedAt instead of destroying the card and its adjustments', async () => {
    prisma.materialInventory.findFirst.mockResolvedValue({ id: 4 });
    prisma.materialInventory.update.mockResolvedValue({ id: 4 });

    await service.remove(4);

    expect(prisma.materialInventory.delete).not.toHaveBeenCalled();
    const args = prisma.materialInventory.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 4 });
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it('refuses to remove a card that is already deleted', async () => {
    prisma.materialInventory.findFirst.mockResolvedValue(null);

    await expect(service.remove(4)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides deleted cards from the daily sheet', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([]);

    await service.findByDate('2026-09-08');

    const where = prisma.materialInventory.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
  });

  it('treats a deleted card as missing on findOne', async () => {
    prisma.materialInventory.findFirst.mockResolvedValue(null);

    await expect(service.findOne(4)).rejects.toBeInstanceOf(NotFoundException);
    const where = prisma.materialInventory.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: 4, deletedAt: null });
  });

  it('restores a deleted card when the same day is re-entered', async () => {
    prisma.materialInventory.upsert.mockResolvedValue({ id: 4 });

    await service.create({ materialId: 1, date: '2026-09-08', quantity: 5 });

    const args = prisma.materialInventory.upsert.mock.calls[0][0];
    expect(args.update.deletedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Date-range bounds
//
// These threw a bare `Error`, which the global exception filter renders as a
// 500 — so asking for too wide a range told the user the server had failed.
// ---------------------------------------------------------------------------

describe('MaterialInventoryService date-range bounds', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: makeCache() },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects an over-wide gaps range as a bad request, not a server error', async () => {
    await expect(
      service.getGaps('2026-01-01', '2026-12-31'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a reversed gaps range as a bad request', async () => {
    await expect(
      service.getGaps('2026-09-08', '2026-09-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an over-wide init range as a bad request', async () => {
    await expect(
      service.initDateRange('2026-01-01', '2026-12-31'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// Bulk save
//
// The material sheet sent one PATCH per edited row through Promise.all, which
// runs into the same 20-requests/minute ceiling as the inventory sheet.
// ---------------------------------------------------------------------------

describe('MaterialInventoryService.updateBulk', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: makeCache() },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('writes every edit in a single transaction', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ]);

    const res = await service.updateBulk([
      { id: 1, delivery: 5 },
      { id: 2, delivery: 6 },
    ]);

    expect(res).toEqual({ updated: 2 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.materialInventory.update).toHaveBeenCalledTimes(2);
  });

  it('refuses the whole batch when a row is missing or deleted', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([{ id: 1 }]);

    await expect(
      service.updateBulk([{ id: 1, delivery: 5 }, { id: 2, delivery: 6 }]),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only considers live cards', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([{ id: 1 }]);

    await service.updateBulk([{ id: 1, delivery: 5 }]);

    const where = prisma.materialInventory.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ deletedAt: null });
  });
});

// ---------------------------------------------------------------------------
// Error reporting
//
// update() wrapped everything in `try { ... } catch { throw NotFound }`, which
// reported a unique-constraint collision as "record not found". Worse, the
// blanket catch ran *before* PrismaExceptionFilter, which would otherwise have
// turned that same error into an accurate 409.
// ---------------------------------------------------------------------------

describe('MaterialInventoryService.update error reporting', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: makeCache() },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('reports a missing card as not found', async () => {
    prisma.materialInventory.findFirst.mockResolvedValue(null);

    await expect(service.update(4, { delivery: 5 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.materialInventory.update).not.toHaveBeenCalled();
  });

  it('lets a constraint violation through instead of calling it not found', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });
    prisma.materialInventory.findFirst.mockResolvedValue({ id: 4 });
    prisma.materialInventory.update.mockRejectedValue(collision);

    await expect(service.update(4, { materialId: 9 })).rejects.toBe(collision);
  });
});

describe('MaterialInventoryService audit trail', () => {
  let service: MaterialInventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialInventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheNamespaceService, useValue: makeCache() },
      ],
    }).compile();
    service = module.get(MaterialInventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('records who amended a card', async () => {
    prisma.materialInventory.findFirst.mockResolvedValue({ id: 4 });
    prisma.materialInventory.update.mockResolvedValue({ id: 4 });

    await service.update(4, { delivery: 5 }, 42);

    expect(prisma.materialInventory.update.mock.calls[0][0].data.updatedById).toBe(42);
  });

  it('records who amended each card of a bulk save', async () => {
    prisma.materialInventory.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    await service.updateBulk([{ id: 1, delivery: 5 }, { id: 2, delivery: 6 }], 42);

    for (const call of prisma.materialInventory.update.mock.calls) {
      expect(call[0].data.updatedById).toBe(42);
    }
  });
});
