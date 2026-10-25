import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useProductionMutations } from './useProductionMutations';

vi.mock('@/lib/apiServices', () => ({
  jobsApi: { autofill: vi.fn().mockResolvedValue({ data: {} }) },
  inventoryApi: {},
  productionApi: {},
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('useProductionMutations', () => {
  it('refreshes the yields as well as the deliveries after initializing branches', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(
      () => useProductionMutations({ filterDate: '2026-10-25', products: [], branches: [], branchesWithNoInventory: new Set(), onError: vi.fn() }),
      { wrapper },
    );
    // Autofill creates production and inventory rows; refreshing only one half let the board
    // compare new deliveries with old yields and refuse to save ("over-allocated").
    await act(async () => { await result.current.initAllBranchesMutation.mutateAsync(); });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['production'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory-for-production'] });
  });
});
