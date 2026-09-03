import { CACHE_NS } from '../common/cache/cache-namespaces';

/** Prisma operations that mutate rows and therefore invalidate aggregations. */
const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

type Registry = { bump(namespace: string): void };

interface AllOpsArgs {
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

/**
 * A Prisma client extension that bumps the relevant cache namespace after any
 * successful write to Inventory / InventoryAdjustment / MaterialInventory /
 * MaterialAdjustment. Centralising here means no writer service can bypass
 * invalidation — MaterialAdjustment was the one model that could, and material
 * stock figures fold its rows in.
 */
export function buildInvalidationExtension(registry: Registry) {
  const hook = (namespace: string) => ({
    async $allOperations({ operation, args, query }: AllOpsArgs) {
      // Bump fires after the operation executes. Inside an interactive
      // transaction this is before commit, so a later ROLLBACK still
      // invalidated — this is intentional and benign: it only forces a
      // recompute on next read and can never serve stale data.
      const result = await query(args); // only invalidate after success
      if (WRITE_OPS.has(operation)) registry.bump(namespace);
      return result;
    },
  });

  return {
    name: 'cache-invalidation',
    query: {
      inventory: hook(CACHE_NS.INVENTORY_AGG),
      inventoryAdjustment: hook(CACHE_NS.INVENTORY_AGG),
      materialInventory: hook(CACHE_NS.MATERIAL_AGG),
      materialAdjustment: hook(CACHE_NS.MATERIAL_AGG),
    },
  };
}
