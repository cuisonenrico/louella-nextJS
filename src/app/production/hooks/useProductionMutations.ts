'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { inventoryApi, productionApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, Production } from '@/types';

function extractErrorMessage(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? (err as Error)?.message ?? 'An error occurred.');
}

interface UseProductionMutationsParams {
  filterDate: string;
  products: Product[];
  branches: Branch[];
  branchesWithNoInventory: Set<number>;
  prodQueryData: Production[] | undefined;
  onError: (msg: string) => void;
}

export function useProductionMutations({
  filterDate,
  products,
  branches,
  branchesWithNoInventory,
  prodQueryData,
  onError,
}: UseProductionMutationsParams) {
  const qc = useQueryClient();

  const initBranchMutation = useMutation({
    mutationFn: async (branchId: number) => {
      const yesterday = dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD');
      const prevRes = await inventoryApi.byBranchDate(branchId, yesterday);
      const prevData = (prevRes.data ?? []) as Inventory[];
      const prevMap = new Map(prevData.map((i) => [i.productId, Math.max(0, i.leftover - i.reject)]));
      const payload = products
        .filter((p) => p.isActive)
        .map((p) => ({ branchId, productId: p.id, date: filterDate, quantity: prevMap.get(p.id) ?? 0, delivery: 0, leftover: 0, reject: 0 }));
      return inventoryApi.createBulk(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory-for-production'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err) => onError(extractErrorMessage(err)),
  });

  const initAllBranchesMutation = useMutation({
    mutationFn: async () => {
      const yesterday = dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD');
      const missingBranches = branches.filter((b) => branchesWithNoInventory.has(b.id));
      await Promise.all(
        missingBranches.map(async (b) => {
          const prevRes = await inventoryApi.byBranchDate(b.id, yesterday);
          const prevData = (prevRes.data ?? []) as Inventory[];
          const prevMap = new Map(prevData.map((i) => [i.productId, Math.max(0, i.leftover - i.reject)]));
          const payload = products
            .filter((p) => p.isActive)
            .map((p) => ({ branchId: b.id, productId: p.id, date: filterDate, quantity: prevMap.get(p.id) ?? 0, delivery: 0, leftover: 0, reject: 0 }));
          return inventoryApi.createBulk(payload);
        }),
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory-for-production'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err) => onError(extractErrorMessage(err)),
  });

  const initProductionMutation = useMutation({
    mutationFn: () => {
      const existingProductIds = new Set((prodQueryData ?? []).map((p) => p.productId));
      const payload = products
        .filter((p) => p.isActive && !existingProductIds.has(p.id))
        .map((p) => ({ branchId: 1, productId: p.id, date: filterDate, yield: 0 }));
      return productionApi.createBulk(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production'] }),
    onError: (err) => onError(extractErrorMessage(err)),
  });

  const savePendingMutation = useMutation({
    mutationFn: async (data: {
      production: Map<number, { yield: number }>;
      inventory: Map<number, { delivery: number }>;
    }) => {
      await Promise.all([
        ...Array.from(data.production.entries()).map(([id, d]) => productionApi.update(id, d)),
        ...Array.from(data.inventory.entries()).map(([id, d]) => inventoryApi.update(id, d)),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
    },
    onError: (err) => onError(extractErrorMessage(err)),
  });

  return { initBranchMutation, initAllBranchesMutation, initProductionMutation, savePendingMutation };
}
