import { useMemo } from 'react';
import type { Branch, Product, ProductType } from '@/types';
import type { ProdRow } from './useProductionRowUpdate';

export interface ProductionSummaryData {
  totalYield: number;
  totalPlanned: number;
  yieldByType: Record<ProductType, number>;
  assignedByBranch: Map<number, number>;
  totalAssigned: number;
  expectedRevenue: number;
}

export function useProductionSummary(
  allRows: ProdRow[],
  branches: Branch[],
  productById: Map<number, Product>,
  plannedByProduct: Map<number, number>,
): ProductionSummaryData | null {
  return useMemo(() => {
    const prodRows = allRows.filter((r) => r._productionId != null);
    if (prodRows.length === 0) return null;

    let totalYield = 0;
    let totalPlanned = 0;
    let expectedRevenue = 0;
    const yieldByType: Record<ProductType, number> = { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 };
    const assignedByBranch = new Map<number, number>(branches.map((b) => [b.id, 0]));

    for (const row of prodRows) {
      totalYield += row.yield;
      totalPlanned += plannedByProduct.get(row.productId) ?? 0;
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

    return { totalYield, totalPlanned, yieldByType, assignedByBranch, totalAssigned, expectedRevenue };
  }, [allRows, branches, productById, plannedByProduct]);
}
