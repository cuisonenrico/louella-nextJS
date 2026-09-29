import { AsyncLocalStorage } from 'node:async_hooks';
import { CACHE_NS } from '../common/cache/cache-namespaces';

/**
 * Namespaces written inside the interactive transaction running in this
 * async context. PrismaService bumps them again once the transaction commits.
 */
const writesInTransaction = new AsyncLocalStorage<Set<string>>();

/**
 * Run a transaction, then bump every namespace it wrote to after it settles.
 *
 * The per-query bump below fires before COMMIT. A read landing between that
 * bump and the commit still sees the old rows and caches them under the new
 * version, where they stayed for the whole TTL. The second bump orphans that
 * entry the moment the write becomes visible.
 */
export function withPostCommitBump<T>(registry: Registry, run: () => Promise<T>): Promise<T> {
  const touched = new Set<string>();
  const bumpAll = () => {
    for (const namespace of touched) registry.bump(namespace);
  };
  return writesInTransaction.run(touched, run).then(
    (value) => {
      bumpAll();
      return value;
    },
    (err: unknown) => {
      bumpAll();
      throw err;
    },
  );
}

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
      // invalidated — benign, it only forces a recompute. The namespaces are
      // also noted for withPostCommitBump, which bumps again after COMMIT.
      const result = await query(args); // only invalidate after success
      if (WRITE_OPS.has(operation)) {
        const pending = writesInTransaction.getStore();
        for (const namespace of namespaces) {
          registry.bump(namespace);
          pending?.add(namespace);
        }
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
