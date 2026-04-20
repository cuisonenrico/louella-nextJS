'use client';

import { useCallback, useState } from 'react';
import type { Branch, ProductType } from '@/types';

/** Row type shared across production page and hooks. */
export type ProdRow = {
  id: number;
  productId: number;
  type: ProductType;
  _productionId: number | null;
  yield: number;
  [key: string]: unknown;
};

/**
 * Manages pending production/inventory edits for the production page tables.
 */
export function useProductionRowUpdate(branches: Branch[]) {
  const [pendingProduction, setPendingProduction] = useState<Map<number, { yield: number }>>(new Map());
  const [pendingInventory, setPendingInventory] = useState<Map<number, { delivery: number }>>(new Map());

  /** Recompute yield = sum of all branch deliveries for a row. */
  const syncYieldToDeliveries = useCallback(
    (row: ProdRow, updatedInventory: Map<number, { delivery: number }>) => {
      const prodId = row._productionId;
      if (prodId == null) return;

      let total = 0;
      for (const b of branches) {
        const invId = row[`_inv_${b.id}`] as number | null;
        if (invId != null && updatedInventory.has(invId)) {
          total += updatedInventory.get(invId)!.delivery;
        } else {
          total += (row[`branch_${b.id}`] as number) ?? 0;
        }
      }

      setPendingProduction((prev) => {
        const next = new Map(prev);
        next.set(prodId, { yield: total });
        return next;
      });
    },
    [branches],
  );

  const handleFieldChange = useCallback(
    (row: ProdRow, field: string, newValue: number) => {
      if (field === 'yield') {
        // Yield is now auto-computed — ignore direct edits
        return;
      } else if (field.startsWith('branch_')) {
        const branchSuffix = field.slice('branch_'.length);
        const invId = row[`_inv_${branchSuffix}`] as number | null;
        if (invId != null) {
          setPendingInventory((prev) => {
            const next = new Map(prev);
            next.set(invId, { delivery: newValue });
            // Sync yield after updating this branch
            syncYieldToDeliveries(row, next);
            return next;
          });
        }
      }
    },
    [syncYieldToDeliveries],
  );

  const resetPending = useCallback(() => {
    setPendingProduction(new Map());
    setPendingInventory(new Map());
  }, []);

  return { pendingProduction, pendingInventory, handleFieldChange, resetPending };
}
