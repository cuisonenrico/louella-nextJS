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
  const hook = (...namespaces: string[]) => ({
    async $allOperations({ operation, args, query }: AllOpsArgs) {
      // Bump fires after the operation executes. Inside an interactive
      // transaction this is before commit, so a later ROLLBACK still
      // invalidated — this is intentional and benign: it only forces a
      // recompute on next read and can never serve stale data.
      const result = await query(args); // only invalidate after success
      if (WRITE_OPS.has(operation)) {
        for (const namespace of namespaces) registry.bump(namespace);
      }
      return result;
    },
  });

  // The dashboard summary folds in inventory, adjustments and production, so
  // it is invalidated by the same writes. Its remaining inputs — product,
  // branch, material and recipe counts — change rarely, and go stale only for
  // the TTL, which is the same bound this cache already accepts everywhere.
  return {
    name: 'cache-invalidation',
    query: {
      inventory: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      inventoryAdjustment: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      materialInventory: hook(CACHE_NS.MATERIAL_AGG, CACHE_NS.DASHBOARD_AGG),
      materialAdjustment: hook(CACHE_NS.MATERIAL_AGG, CACHE_NS.DASHBOARD_AGG),
      production: hook(CACHE_NS.DASHBOARD_AGG),
    },
  };
}
