import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { PlannedYield, ProductionOrder, ProductType } from '@/types';
import type { ProdRow } from './useProductionRowUpdate';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

export function buildFinalizedPlannedYields(orders: ProductionOrder[]): PlannedYield[] {
  const totals = new Map<number, number>();
  for (const order of orders) {
    if (order.status !== 'FINALIZED') continue;
    for (const item of order.items) {
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.yield);
    }
  }
  return Array.from(totals.entries()).map(([productId, plannedYield]) => ({ productId, plannedYield }));
}

interface UseYieldAutoSyncParams {
  allRows: ProdRow[];
  plannedByProduct: Map<number, number>;
  pendingProduction: Map<number, { yield: number }>;
  handleFieldChange: (row: ProdRow, field: string, newValue: number) => void;
  filterDate: string;
}

export function useYieldAutoSync({
  allRows,
  plannedByProduct,
  pendingProduction,
  handleFieldChange,
  filterDate,
}: UseYieldAutoSyncParams): void {
  const plannedBaselineRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    let changed = false;
    const nextPending = new Map(pendingProduction);

    for (const row of allRows) {
      if (row._productionId == null) continue;

      const planned = plannedByProduct.get(row.productId) ?? 0;
      const previousPlanned = plannedBaselineRef.current.get(row.productId);
      const pending = nextPending.get(row._productionId);

      if (previousPlanned == null) {
        plannedBaselineRef.current.set(row.productId, planned);
        // Initial fill: if yield is zero and planned exists, initialize yield from planned.
        if (row.yield === 0 && planned > 0 && pending == null) {
          nextPending.set(row._productionId, { yield: planned });
          changed = true;
        }
        continue;
      }

      const delta = planned - previousPlanned;
      if (delta !== 0) {
        const baseYield = pending?.yield ?? row.yield;
        nextPending.set(row._productionId, { yield: Math.max(0, baseYield + delta) });
        plannedBaselineRef.current.set(row.productId, planned);
        changed = true;
      }
    }

    if (changed) {
      for (const row of allRows) {
        if (row._productionId == null) continue;
        const updated = nextPending.get(row._productionId);
        if (!updated) continue;
        if ((pendingProduction.get(row._productionId)?.yield ?? row.yield) !== updated.yield) {
          handleFieldChange(row, 'yield', updated.yield);
        }
      }
    }
  }, [allRows, plannedByProduct, pendingProduction, handleFieldChange]);

  useEffect(() => {
    plannedBaselineRef.current = new Map();
  }, [filterDate]);
}

export function useYieldEnterNavigation(rowsByType: Map<ProductType, ProdRow[]>) {
  const yieldInputOrder = useMemo(() => {
    return PRODUCT_TYPE_ORDER.flatMap((type) =>
      (rowsByType.get(type) ?? [])
        .filter((row) => row._productionId != null)
        .map((row) => row.productId),
    );
  }, [rowsByType]);

  return useCallback((productId: number) => {
    const index = yieldInputOrder.indexOf(productId);
    if (index < 0) return;
    const nextProductId = yieldInputOrder[index + 1];
    if (nextProductId == null) return;
    const el = document.getElementById(`yield-input-${nextProductId}`) as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }, [yieldInputOrder]);
}

export function useProductionTabNavigation(
  rowsByType: Map<ProductType, ProdRow[]>,
  branchIds: number[],
) {
  const inputOrder = useMemo(() => {
    const order: string[] = [];

    for (const type of PRODUCT_TYPE_ORDER) {
      const rows = rowsByType.get(type) ?? [];
      for (const row of rows) {
        if (row._productionId != null) {
          order.push(`yield-input-${row.productId}`);
        }

        for (const branchId of branchIds) {
          const hasRecord = (row[`_inv_${branchId}`] as number | null) != null;
          if (hasRecord) {
            order.push(`branch-input-${row.productId}-${branchId}`);
          }
        }
      }
    }

    return order;
  }, [rowsByType, branchIds]);

  return useCallback((currentInputId: string): boolean => {
    const index = inputOrder.indexOf(currentInputId);
    if (index < 0) return false;

    const nextInputId = inputOrder[index + 1];
    if (!nextInputId) return false;

    const el = document.getElementById(nextInputId) as HTMLInputElement | null;
    if (!el) return false;

    el.focus();
    el.select();
    return true;
  }, [inputOrder]);
}
