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
 * pendingProduction is keyed by productId so rows without an existing production
 * record (new rows) can also track yield changes.
 */
export function useProductionRowUpdate() {
  const [pendingProduction, setPendingProduction] = useState<
    Map<number, { _productionId: number | null; yield: number }>
  >(new Map());
  const [pendingInventory, setPendingInventory] = useState<Map<number, { delivery: number }>>(new Map());

  const handleFieldChange = useCallback(
    (row: ProdRow, field: string, newValue: number) => {
      if (field === 'yield') {
        setPendingProduction((prev) => {
          const next = new Map(prev);
          next.set(row.productId, { _productionId: row._productionId, yield: newValue });
          return next;
        });
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

  const getEffectiveValue = useCallback(
    (row: ProdRow, field: string): number => {
      if (field === 'yield') {
        const pending = pendingProduction.get(row.productId);
        if (pending !== undefined) return pending.yield;
        return row.yield;
      }
      if (field.startsWith('branch_')) {
        const branchSuffix = field.slice('branch_'.length);
        const invId = row[`_inv_${branchSuffix}`] as number | null;
        if (invId != null && pendingInventory.has(invId)) return pendingInventory.get(invId)!.delivery;
        return (row[field] as number) ?? 0;
      }
      return (row[field] as number) ?? 0;
    },
    [pendingProduction, pendingInventory],
  );

  return { pendingProduction, pendingInventory, handleFieldChange, resetPending, getEffectiveValue };
}
