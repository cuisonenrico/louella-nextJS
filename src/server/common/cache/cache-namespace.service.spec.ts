import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheNamespaceService } from './cache-namespace.service';

function makeCacheMock() {
  const store = new Map<string, unknown>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)),
    set: jest.fn(async (key: string, val: unknown) => void store.set(key, val)),
    del: jest.fn(async (key: string) => void store.delete(key)),
  };
}

async function build(config: Record<string, string> = {}) {
  const cache = makeCacheMock();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CacheNamespaceService,
      { provide: CACHE_MANAGER, useValue: cache },
      {
        provide: ConfigService,
        useValue: { get: (k: string, d?: unknown) => config[k] ?? d },
      },
    ],
  }).compile();
  return { service: moduleRef.get(CacheNamespaceService), cache };
}

describe('CacheNamespaceService', () => {
  it('computes on miss and returns cached value on hit (compute runs once)', async () => {
    const { service } = await build();
    const compute = jest.fn(async () => 42);

    const a = await service.wrap('inventory-agg', ['summary', 1], compute);
    const b = await service.wrap('inventory-agg', ['summary', 1], compute);

    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes after bump (version change orphans the old key)', async () => {
    const { service } = await build();
    const compute = jest.fn(async () => 7);

    await service.wrap('inventory-agg', ['summary', 1], compute);
    service.bump('inventory-agg');
    await service.wrap('inventory-agg', ['summary', 1], compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache entirely when CACHE_ENABLED=false', async () => {
    const { service, cache } = await build({ CACHE_ENABLED: 'false' });
    const compute = jest.fn(async () => 1);

    await service.wrap('inventory-agg', ['x'], compute);
    await service.wrap('inventory-agg', ['x'], compute);

    expect(compute).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('falls through to computeFn when the cache store throws (fail-open)', async () => {
    const { service, cache } = await build();
    cache.get.mockRejectedValueOnce(new Error('store down'));
    cache.set.mockRejectedValueOnce(new Error('store down'));

    const result = await service.wrap('inventory-agg', ['y'], async () => 99);
    expect(result).toBe(99);
  });
});
