import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventoryApi, productionApi } from '@/lib/apiServices';
import { useBoardQueue } from './useBoardQueue';

vi.mock('@/lib/apiServices', () => ({
  inventoryApi: { updateBulk: vi.fn(), byDateRange: vi.fn() },
  productionApi: { upsertBulk: vi.fn(), byDateRange: vi.fn() },
}));
const upsertBulk = vi.mocked(productionApi.upsertBulk);
const updateBulk = vi.mocked(inventoryApi.updateBulk);
const prodRows = vi.mocked(productionApi.byDateRange);
const invRows = vi.mocked(inventoryApi.byDateRange);

const DATE = '2026-10-25';
const ok = () => Promise.resolve({ data: [] } as never);
const networkError = () => Promise.reject({ isAxiosError: true, request: {}, message: 'Network Error' });
const status = (code: number) => Promise.reject({ isAxiosError: true, response: { status: code, data: { message: 'no' } } });

function memoryStorage(): Storage {
  const ls = new Map<string, string>();
  return {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  } as unknown as Storage;
}

function setup() {
  const storage = memoryStorage();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useBoardQueue(1, { storage }), { wrapper });
}

/** The server as the drain will see it: yield 10 for product 3, delivery 8 on row 91. */
function serverHas(yieldVal = 10, delivery = 8) {
  prodRows.mockImplementation(() => Promise.resolve({ data: [{ productId: 3, yield: yieldVal }] } as never));
  invRows.mockImplementation(() => Promise.resolve({ data: [{ id: 91, productId: 3, delivery }] } as never));
}

const yieldChange = (value: number, base = 10) => ({ kind: 'yield' as const, date: DATE, productId: 3, value, base });
const deliveryChange = (value: number, base = 8) => ({ kind: 'delivery' as const, date: DATE, productId: 3, inventoryId: 91, value, base });

describe('useBoardQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serverHas();
    upsertBulk.mockImplementation(ok);
    updateBulk.mockImplementation(ok);
  });
  afterEach(() => vi.useRealTimers());

  it('sends a yield and a delivery, one request each, and empties the queue', async () => {
    const { result } = setup();
    act(() => result.current.save([yieldChange(12), deliveryChange(11)]));
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
    expect(upsertBulk).toHaveBeenCalledWith([{ productId: 3, date: DATE, yield: 12 }], { timeout: 15000 });
    expect(updateBulk).toHaveBeenCalledWith([{ id: 91, delivery: 11 }], { timeout: 15000 });
  });

  it('shows queued values over the server ones', () => {
    upsertBulk.mockImplementation(networkError);
    const { result } = setup();
    act(() => result.current.save([yieldChange(12), deliveryChange(11)]));
    expect(result.current.overlayYield(DATE, 3)).toBe(12);
    expect(result.current.overlayDelivery(91)).toBe(11);
    expect(result.current.overlayYield('2026-10-24', 3)).toBeUndefined();
  });

  it('does not overwrite a figure that changed on the server meanwhile', async () => {
    serverHas(15); // an order was finalized: 10 → 15
    const { result } = setup();
    act(() => result.current.save([yieldChange(12), deliveryChange(11)]));
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.failed[0]).toMatchObject({
      key: `yield:${DATE}:3`,
      error: 'Changed to 15 on the server — check and save again',
    });
    expect(upsertBulk).not.toHaveBeenCalled();
    expect(updateBulk).toHaveBeenCalledWith([{ id: 91, delivery: 11 }], { timeout: 15000 });
  });

  it('keeps an edit through a dropped connection and retries it', async () => {
    upsertBulk.mockImplementationOnce(networkError).mockImplementation(ok);
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await waitFor(() => expect(upsertBulk).toHaveBeenCalledTimes(1));
    expect(result.current.waiting).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
  });

  it('keeps everything when the session has ended', async () => {
    upsertBulk.mockImplementation(() => status(401));
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await waitFor(() => expect(upsertBulk).toHaveBeenCalledTimes(1));
    expect(result.current.waiting).toHaveLength(1);
    expect(result.current.failed).toHaveLength(0);
  });

  it('flags a change the server refuses', async () => {
    upsertBulk.mockImplementation(() => status(400));
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.failed[0].error).toBe('no');
  });
});
