'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      // Two requests, not one per edited row. A PATCH per row runs into the
      // global 20-requests/minute throttle on any real sheet, and Promise.all
      // rejects on the first 429 — reporting failure over a partial save.
      // upsertBulk keys on (branch, product, date), so rows that already exist
      // are updated by the same call that creates the new ones.
      const production = Array.from(data.production.entries())
        .map(([productId, d]) => ({ productId, date: filterDate, yield: d.yield }));

      const inventory = Array.from(data.inventory.entries())
        .map(([id, d]) => ({ id, delivery: d.delivery }));

      await Promise.all([
        production.length > 0 ? productionApi.upsertBulk(production) : Promise.resolve(),
        inventory.length > 0 ? inventoryApi.updateBulk(inventory) : Promise.resolve(),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
      toast.success('Production saved');
    },
    onError: (err) => { const text = extractError(err); onError(text); toast.error(text); },
  });

  return { initBranchMutation, initAllBranchesMutation, savePendingMutation };
}
