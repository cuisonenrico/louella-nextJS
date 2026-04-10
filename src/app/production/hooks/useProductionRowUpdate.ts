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
 * Manages pending production/inventory edits and the row-update handler for
 * the production DataGrids.
 */
export function useProductionRowUpdate(branches: Branch[]) {
  const [pendingProduction, setPendingProduction] = useState<Map<number, { yield: number }>>(
    new Map(),
  );
  const [pendingInventory, setPendingInventory] = useState<Map<number, { delivery: number }>>(
    new Map(),
  );

  const handleProcessRowUpdate = useCallback(
    (newRow: ProdRow, oldRow: ProdRow): ProdRow => {
      const newYield = Number(newRow.yield);
      const totalAssigned = branches.reduce((sum, b) => {
        const val = Number(newRow[`branch_${b.id}`] ?? 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
      if (totalAssigned > newYield) {
        throw new Error(
          `Total assigned (${totalAssigned}) exceeds yield (${newYield}) for this product.`,
        );
      }

      if (newRow.yield !== oldRow.yield) {
        const prodId = newRow._productionId;
        if (prodId != null) {
          setPendingProduction((prev) => {
            const next = new Map(prev);
            next.set(prodId, { yield: Number(newRow.yield) });
            return next;
          });
        }
      }

      for (const b of branches) {
        const field = `branch_${b.id}`;
        if (newRow[field] !== oldRow[field]) {
          const invId = newRow[`_inv_${b.id}`] as number | null;
          if (invId != null) {
            setPendingInventory((prev) => {
              const next = new Map(prev);
              next.set(invId, { delivery: Number(newRow[field]) });
              return next;
            });
          }
        }
      }

      return newRow;
    },
    [branches],
  );

  const resetPending = useCallback(() => {
    setPendingProduction(new Map());
    setPendingInventory(new Map());
  }, []);

  return { pendingProduction, pendingInventory, handleProcessRowUpdate, resetPending };
}
