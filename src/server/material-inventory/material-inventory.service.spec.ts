import { Test, TestingModule } from '@nestjs/testing';
import { MaterialInventoryService } from './material-inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { CACHE_NS } from '../common/cache/cache-namespaces';

function makePrisma() {
  return {
    materialInventory: { findMany: jest.fn() },
    material: { findMany: jest.fn() },
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
