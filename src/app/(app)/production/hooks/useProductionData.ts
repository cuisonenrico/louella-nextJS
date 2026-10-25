import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { branchesApi, inventoryApi, productionApi, productionOrdersApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, Production, ProductionOrder, ProductType } from '@/types';
import type { ProdRow } from './useProductionRowUpdate';
import { useProductionMutations } from './useProductionMutations';
import { buildFinalizedPlannedYields } from './useProductionPlannedYield';
import { kitchenRowsByProduct } from '../lib/kitchenRows';

export const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

/**
 * The production board's data for one day: products, branches, the kitchen's
 * yield rows, each branch's delivery rows, and what finalized orders planned —
 * in total and per branch. Shared by the desktop sheet and the phone board.
 * Branches with no inventory rows for the day are initialized automatically,
 * as the board has always done.
 */
export function useProductionData(filterDate: string, onError: (message: string) => void) {
  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const prodQuery = useQuery({
    queryKey: ['production', filterDate],
    queryFn: () => productionApi.byDateRange(filterDate).then((r) => r.data as Production[]),
    placeholderData: keepPreviousData,
  });

  const invQuery = useQuery({
    queryKey: ['inventory-for-production', filterDate],
    queryFn: () => inventoryApi.byDateRange(filterDate).then((r) => r.data as Inventory[]),
    placeholderData: keepPreviousData,
  });

  const { data: rawOrders = [] } = useQuery<ProductionOrder[]>({
    queryKey: ['planned-yield', filterDate],
    queryFn: () => productionOrdersApi.byDate(filterDate).then((r) => r.data as ProductionOrder[]),
    placeholderData: keepPreviousData,
  });

  const plannedYields = useMemo(() => buildFinalizedPlannedYields(rawOrders), [rawOrders]);

  const plannedByProduct = useMemo(
    () => new Map(plannedYields.map((p) => [p.productId, p.plannedYield])),
    [plannedYields],
  );

  const branchesWithNoInventory = useMemo(() => {
    const branchIdsWithRecords = new Set((invQuery.data ?? []).map((inv) => inv.branchId));
    return new Set(branches.filter((b) => !branchIdsWithRecords.has(b.id)).map((b) => b.id));
  }, [invQuery.data, branches]);

  const { initBranchMutation, initAllBranchesMutation, savePendingMutation } = useProductionMutations({
    filterDate, products, branches, branchesWithNoInventory, onError,
  });

  const orderedByProductBranch = useMemo(() => {
    const m = new Map<string, number>();
    for (const order of rawOrders) {
      if (order.status !== 'FINALIZED' || order.branchId == null) continue;
      for (const item of order.items) {
        const key = `${item.productId}:${order.branchId}`;
        m.set(key, (m.get(key) ?? 0) + item.yield);
      }
    }
    return m;
  }, [rawOrders]);

  // Auto-init inventory for any branch that doesn't have records yet
  useEffect(() => {
    if (!invQuery.isLoading && !invQuery.isFetching && branchesWithNoInventory.size > 0 && !initAllBranchesMutation.isPending) {
      initAllBranchesMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invQuery.isLoading, invQuery.isFetching, branchesWithNoInventory.size]);

  // Lookup maps
  const productionByProduct = useMemo(
    () => kitchenRowsByProduct(prodQuery.data ?? []),
    [prodQuery.data],
  );

  const inventoryByProductBranch = useMemo(() => {
    const m = new Map<string, Inventory>();
    for (const inv of invQuery.data ?? []) m.set(`${inv.productId}:${inv.branchId}`, inv);
    return m;
  }, [invQuery.data]);

  // One row per active product
  const allRows = useMemo<ProdRow[]>(() => {
    return products.filter((p) => p.isActive).map((p) => {
      const prodRec = productionByProduct.get(p.id);
      const row: ProdRow = { id: p.id, productId: p.id, type: p.type, _productionId: prodRec?.id ?? null, yield: prodRec?.yield ?? 0 };
      for (const b of branches) {
        const inv = inventoryByProductBranch.get(`${p.id}:${b.id}`);
        row[`branch_${b.id}`] = inv?.delivery ?? 0;
        row[`_inv_${b.id}`] = inv?.id ?? null;
      }
      return row;
    });
  }, [products, branches, productionByProduct, inventoryByProductBranch]);

  const rowsByType = useMemo(() => {
    const map = new Map<ProductType, ProdRow[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    for (const row of allRows) map.get(row.type)?.push(row);
    return map;
  }, [allRows]);

  return {
    branches, products, productById, prodQuery, invQuery, rawOrders, plannedYields, plannedByProduct,
    orderedByProductBranch, branchesWithNoInventory, inventoryByProductBranch, allRows, rowsByType,
    initBranchMutation, initAllBranchesMutation, savePendingMutation,
  };
}

export type ProductionData = ReturnType<typeof useProductionData>;
