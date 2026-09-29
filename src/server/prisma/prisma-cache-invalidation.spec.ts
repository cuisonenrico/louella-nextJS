import { buildInvalidationExtension, withPostCommitBump } from './prisma-cache-invalidation';
import { CACHE_NS } from '../common/cache/cache-namespaces';

function runHook(hook: any, operation: string) {
  return hook.$allOperations({ operation, args: {}, query: async () => 'db-result' });
}

describe('buildInvalidationExtension', () => {
  // Revenue is sold × the price in force, and the gap reports list active
  // catalogue rows: a price or catalogue write used to wait out the TTL.
  it.each([
    ['product', CACHE_NS.INVENTORY_AGG],
    ['productPriceHistory', CACHE_NS.INVENTORY_AGG],
    ['branch', CACHE_NS.INVENTORY_AGG],
    ['material', CACHE_NS.MATERIAL_AGG],
    ['materialPriceHistory', CACHE_NS.MATERIAL_AGG],
    ['recipe', CACHE_NS.DASHBOARD_AGG],
  ] as const)('bumps %s writes into %s', async (model, ns) => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await runHook((ext.query as Record<string, unknown>)[model], 'update');
    expect(bump).toHaveBeenCalledWith(ns);
  });

  it('does not bump on a read', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await runHook(ext.query.productPriceHistory, 'findMany');
    expect(bump).not.toHaveBeenCalled();
  });

  it('bumps inventory-agg on a write to Inventory', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    const out = await runHook(ext.query.inventory, 'update');
    expect(out).toBe('db-result');
    expect(bump).toHaveBeenCalledWith(CACHE_NS.INVENTORY_AGG);
  });

  it('bumps inventory-agg on a write to InventoryAdjustment', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await runHook(ext.query.inventoryAdjustment, 'create');
    expect(bump).toHaveBeenCalledWith(CACHE_NS.INVENTORY_AGG);
  });

  it('bumps material-agg on a write to MaterialInventory', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await runHook(ext.query.materialInventory, 'upsert');
    expect(bump).toHaveBeenCalledWith(CACHE_NS.MATERIAL_AGG);
  });

  it('bumps material-agg on a write to MaterialAdjustment', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await runHook(ext.query.materialAdjustment, 'create');
    expect(bump).toHaveBeenCalledWith(CACHE_NS.MATERIAL_AGG);
  });

  it('does NOT bump on a read operation', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await runHook(ext.query.inventory, 'findMany');
    expect(bump).not.toHaveBeenCalled();
  });
});

import { PrismaService } from './prisma.service';

describe('PrismaService (extended + proxy)', () => {
  it('delegates model access to the extended client and keeps lifecycle methods', () => {
    const svc = new PrismaService({ bump: jest.fn() } as any);
    // Model delegates resolve through the proxy to the extended client.
    expect(typeof (svc as any).inventory.findMany).toBe('function');
    expect(typeof (svc as any).materialInventory.upsert).toBe('function');
    // Custom lifecycle method still resolves off the base target.
    expect(typeof svc.onModuleInit).toBe('function');
  });
});

describe('withPostCommitBump', () => {
  it('bumps what a transaction wrote again once it settles', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    let bumpsBeforeCommit = 0;

    await withPostCommitBump({ bump }, async () => {
      await runHook(ext.query.inventory, 'update');
      await runHook(ext.query.product, 'findMany');
      bumpsBeforeCommit = bump.mock.calls.length;
    });

    // Once during the write, once after: a read cached in between is orphaned.
    expect(bump.mock.calls.length).toBe(bumpsBeforeCommit * 2);
    expect(bump.mock.calls.slice(bumpsBeforeCommit).map((c) => c[0]).sort()).toEqual(
      [CACHE_NS.DASHBOARD_AGG, CACHE_NS.INVENTORY_AGG].sort(),
    );
  });

  it('bumps after a rolled-back transaction too, and rethrows', async () => {
    const bump = jest.fn();
    const ext = buildInvalidationExtension({ bump });
    await expect(
      withPostCommitBump({ bump }, async () => {
        await runHook(ext.query.inventory, 'update');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(bump).toHaveBeenCalledTimes(4);
  });
});
