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
 * successful write to a model a cached aggregate reads. Centralising here
 * means no writer service can bypass invalidation.
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

  // Every model a cached aggregate reads, so no write can leave one stale on
  // this instance. Revenue is sold × the price in force, so a price change is
  // as much an inventory-aggregate input as a count; the gap reports list
  // active products, branches and materials; the dashboard counts products,
  // branches, materials and recipes. Price and catalogue writes used to wait
  // out the TTL instead.
  return {
    name: 'cache-invalidation',
    query: {
      inventory: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      inventoryAdjustment: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      product: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      productPriceHistory: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      branch: hook(CACHE_NS.INVENTORY_AGG, CACHE_NS.DASHBOARD_AGG),
      materialInventory: hook(CACHE_NS.MATERIAL_AGG, CACHE_NS.DASHBOARD_AGG),
      materialAdjustment: hook(CACHE_NS.MATERIAL_AGG, CACHE_NS.DASHBOARD_AGG),
      material: hook(CACHE_NS.MATERIAL_AGG, CACHE_NS.DASHBOARD_AGG),
      materialPriceHistory: hook(CACHE_NS.MATERIAL_AGG, CACHE_NS.DASHBOARD_AGG),
      production: hook(CACHE_NS.DASHBOARD_AGG),
      recipe: hook(CACHE_NS.DASHBOARD_AGG),
    },
  };
}
