import { buildInvalidationExtension } from './prisma-cache-invalidation';
import { CACHE_NS } from '../common/cache/cache-namespaces';

function runHook(hook: any, operation: string) {
  return hook.$allOperations({ operation, args: {}, query: async () => 'db-result' });
}

describe('buildInvalidationExtension', () => {
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
