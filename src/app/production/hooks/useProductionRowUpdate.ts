'use client';

import { useCallback, useState } from 'react';
import type { ProductType } from '@/types';

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
export function useProductionRowUpdate() {
  const [pendingProduction, setPendingProduction] = useState<Map<number, { yield: number }>>(new Map());
  const [pendingInventory, setPendingInventory] = useState<Map<number, { delivery: number }>>(new Map());

  const handleFieldChange = useCallback(
    (row: ProdRow, field: string, newValue: number) => {
      if (field === 'yield') {
        const prodId = row._productionId;
        if (prodId != null) {
          setPendingProduction((prev) => {
            const next = new Map(prev);
            next.set(prodId, { yield: newValue });
            return next;
          });
        }
      } else if (field.startsWith('branch_')) {
        const branchSuffix = field.slice('branch_'.length);
        const invId = row[`_inv_${branchSuffix}`] as number | null;
        if (invId != null) {
          setPendingInventory((prev) => {
            const next = new Map(prev);
            next.set(invId, { delivery: newValue });
            return next;
          });
        }
      }
    },
    [],
  );

  const resetPending = useCallback(() => {
    setPendingProduction(new Map());
    setPendingInventory(new Map());
  }, []);

  return { pendingProduction, pendingInventory, handleFieldChange, resetPending };
}
