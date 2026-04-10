import { useMemo } from 'react';
import type { Inventory } from '@/types';

export function useInventoryDisplayRows(
  rows: Inventory[],
  filterBranch: string,
  isRange: boolean,
): Inventory[] {
  return useMemo(() => {
    // All branches: aggregate delivery/leftover/reject/quantity by productId
    if (filterBranch === '') {
      const agg = new Map<number, Inventory>();
      for (const inv of rows) {
        const existing = agg.get(inv.productId);
        if (existing) {
          existing.delivery += inv.delivery;
          existing.leftover += inv.leftover;
          existing.reject += inv.reject;
          existing.quantity += inv.quantity;
        } else {
          agg.set(inv.productId, { ...inv, id: -inv.productId });
        }
      }
      return Array.from(agg.values());
    }

    // Single branch, date range: aggregate by productId across dates
    if (isRange) {
      const agg = new Map<number, Inventory>();
      for (const inv of rows) {
        const existing = agg.get(inv.productId);
        if (existing) {
          existing.delivery += inv.delivery;
          existing.leftover += inv.leftover;
          existing.reject += inv.reject;
          existing.adjustments = [
            ...(existing.adjustments ?? []),
            ...(inv.adjustments ?? []),
          ];
        } else {
          agg.set(inv.productId, {
            ...inv,
            adjustments: [...(inv.adjustments ?? [])],
            id: -(inv.branchId * 100000 + inv.productId),
          });
        }
      }
      return Array.from(agg.values());
    }

    // Single branch, single date: return as-is
    return rows;
  }, [rows, filterBranch, isRange]);
}
