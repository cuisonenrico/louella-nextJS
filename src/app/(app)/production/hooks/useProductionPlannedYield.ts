import { useEffect, useRef } from 'react';
import type { PlannedYield, ProductionOrder } from '@/types';
import type { ProdRow } from './useProductionRowUpdate';

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

type PendingYield = { _productionId: number | null; yield: number };

/**
 * Pure function: computes which yield values need to be updated given the current
 * planned values vs. the stored baseline. Also returns the new baseline to persist.
 */
function computeYieldDeltas(
  allRows: ProdRow[],
  plannedByProduct: Map<number, number>,
  pendingProduction: Map<number, PendingYield>,
  baseline: Map<number, number>,
): { updates: Map<number, PendingYield>; newBaseline: Map<number, number> } {
  const updates = new Map<number, PendingYield>();
  const newBaseline = new Map(baseline);

  for (const row of allRows) {
    const planned = plannedByProduct.get(row.productId) ?? 0;
    const previousPlanned = baseline.get(row.productId);
    const pending = pendingProduction.get(row.productId);

    if (previousPlanned == null) {
      newBaseline.set(row.productId, planned);
      // Initial fill: if yield is zero and planned exists, initialize yield from planned.
      if (row.yield === 0 && planned > 0 && pending == null) {
        updates.set(row.productId, { _productionId: row._productionId, yield: planned });
      }
      continue;
    }

    const delta = planned - previousPlanned;
    if (delta !== 0) {
      const baseYield = pending?.yield ?? row.yield;
      updates.set(row.productId, { _productionId: row._productionId, yield: Math.max(0, baseYield + delta) });
      newBaseline.set(row.productId, planned);
    }
  }

  return { updates, newBaseline };
}

interface UseYieldAutoSyncParams {
  allRows: ProdRow[];
  plannedByProduct: Map<number, number>;
  pendingProduction: Map<number, { _productionId: number | null; yield: number }>;
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
    const { updates, newBaseline } = computeYieldDeltas(
      allRows, plannedByProduct, pendingProduction, plannedBaselineRef.current,
    );
    plannedBaselineRef.current = newBaseline;

    for (const row of allRows) {
      const updated = updates.get(row.productId);
      if (!updated) continue;
      if ((pendingProduction.get(row.productId)?.yield ?? row.yield) !== updated.yield) {
        handleFieldChange(row, 'yield', updated.yield);
      }
    }
  }, [allRows, plannedByProduct, pendingProduction, handleFieldChange]);

  useEffect(() => {
    plannedBaselineRef.current = new Map();
  }, [filterDate]);
}

// Enter/Tab/arrow navigation for the production sheet lives in the shared
// grid model: components/sheet/useSheetNavigation (wired up in ProductionSheet).
