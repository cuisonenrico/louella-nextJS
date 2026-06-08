'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi, jobsApi, productionApi } from '@/lib/apiServices';
import type { Branch, Product } from '@/types';
import { extractError } from '@/lib/errors';

interface UseProductionMutationsParams {
  filterDate: string;
  products: Product[];
  branches: Branch[];
  branchesWithNoInventory: Set<number>;
  onError: (msg: string) => void;
}

export function useProductionMutations({
  filterDate,
  products: _products,
  branches: _branches,
  branchesWithNoInventory: _branchesWithNoInventory,
  onError,
}: UseProductionMutationsParams) {
  const qc = useQueryClient();

  const invalidateInventory = () => {
    qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  /**
   * Init a single branch's inventory for filterDate.
   * Delegates to the autofill job so the carry-forward is always derived from
   * the most recent actual record (not just yesterday), correctly handling gaps.
   */
  const initBranchMutation = useMutation({
    mutationFn: (_branchId: number) => jobsApi.autofill(filterDate),
    onSuccess: invalidateInventory,
    onError: (err) => onError(extractError(err)),
  });

  /**
   * Init all missing branches' inventory for filterDate.
   * Same gap-safe approach — one autofill call handles all missing rows.
   */
  const initAllBranchesMutation = useMutation({
    mutationFn: () => jobsApi.autofill(filterDate),
    onSuccess: invalidateInventory,
    onError: (err) => onError(extractError(err)),
  });

  const savePendingMutation = useMutation({
    mutationFn: async (data: {
      production: Map<number, { _productionId: number | null; yield: number }>;
      inventory: Map<number, { delivery: number }>;
    }) => {
      const toUpsert = Array.from(data.production.entries())
        .filter(([, d]) => d._productionId == null)
        .map(([productId, d]) => ({ productId, date: filterDate, yield: d.yield }));

      const toUpdate = Array.from(data.production.entries())
        .filter(([, d]) => d._productionId != null)
        .map(([, d]) => ({ id: d._productionId!, yield: d.yield }));

      await Promise.all([
        toUpsert.length > 0 ? productionApi.upsertBulk(toUpsert) : Promise.resolve(),
        ...toUpdate.map(({ id, yield: y }) => productionApi.update(id, { yield: y })),
        ...Array.from(data.inventory.entries()).map(([id, d]) => inventoryApi.update(id, d)),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
    },
    onError: (err) => onError(extractError(err)),
  });

  return { initBranchMutation, initAllBranchesMutation, savePendingMutation };
}
