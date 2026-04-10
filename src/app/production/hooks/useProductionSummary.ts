import { useMemo } from 'react';
import type { Branch, Product, ProductType } from '@/types';
import type { ProdRow } from './useProductionRowUpdate';

export interface ProductionSummaryData {
  totalYield: number;
  yieldByType: Record<ProductType, number>;
  assignedByBranch: Map<number, number>;
  totalAssigned: number;
  totalUnassigned: number;
  expectedRevenue: number;
}

export function useProductionSummary(
  allRows: ProdRow[],
  branches: Branch[],
  productById: Map<number, Product>,
): ProductionSummaryData | null {
  return useMemo(() => {
    const prodRows = allRows.filter((r) => r._productionId != null);
    if (prodRows.length === 0) return null;

    let totalYield = 0;
    let expectedRevenue = 0;
    const yieldByType: Record<ProductType, number> = {
      BREAD: 0,
      CAKE: 0,
      SPECIAL: 0,
      MISCELLANEOUS: 0,
    };
    const assignedByBranch = new Map<number, number>(branches.map((b) => [b.id, 0]));

    for (const row of prodRows) {
      totalYield += row.yield;
      yieldByType[row.type] += row.yield;
      let rowAssigned = 0;
      for (const b of branches) {
        const assigned = (row[`branch_${b.id}`] as number) ?? 0;
        assignedByBranch.set(b.id, (assignedByBranch.get(b.id) ?? 0) + assigned);
        rowAssigned += assigned;
      }
      const price = productById.get(row.productId)?.price ?? 0;
      expectedRevenue += rowAssigned * price;
    }

    const totalAssigned = Array.from(assignedByBranch.values()).reduce((a, v) => a + v, 0);
    const totalUnassigned = Math.max(0, totalYield - totalAssigned);

    return {
      totalYield,
      yieldByType,
      assignedByBranch,
      totalAssigned,
      totalUnassigned,
      expectedRevenue,
    };
  }, [allRows, branches, productById]);
}
