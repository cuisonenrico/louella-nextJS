/** Cache namespaces. Each holds an in-memory monotonic version embedded in keys. */
export const CACHE_NS = {
  INVENTORY_AGG: 'inventory-agg',
  MATERIAL_AGG: 'material-agg',
} as const;

export type CacheNamespace = (typeof CACHE_NS)[keyof typeof CACHE_NS];
