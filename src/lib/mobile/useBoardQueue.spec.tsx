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

/** A tiny server: what the writes store is what the reads return. */
const server = { yield: 10, delivery: 8 };
function serve() {
  prodRows.mockImplementation(() => Promise.resolve({ data: [{ id: 1, branchId: 1, productId: 3, yield: server.yield }] } as never));
  invRows.mockImplementation(() => Promise.resolve({ data: [{ id: 91, productId: 3, delivery: server.delivery }] } as never));
  upsertBulk.mockImplementation((items) => {
    server.yield = items[0].yield;
    return Promise.resolve({ data: [{ id: 1, branchId: 1, productId: 3, yield: server.yield, date: `${DATE}T00:00:00.000Z` }] } as never);
  });
  updateBulk.mockImplementation((items) => {
    server.delivery = items[0].delivery ?? server.delivery;
    return Promise.resolve({ data: { updated: 1, cascadeUpdated: 0 } } as never);
  });
}

function setup() {
  const storage = memoryStorage();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useBoardQueue(1, { storage }), { wrapper });
}

/** Past the save debounce. */
const flush = (ms = 1600) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const yieldChange = (value: number, base = 10) => ({ kind: 'yield' as const, date: DATE, productId: 3, value, base });
const deliveryChange = (value: number, base = 8) => ({ kind: 'delivery' as const, date: DATE, productId: 3, inventoryId: 91, value, base });

describe('useBoardQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.yield = 10;
    server.delivery = 8;
    serve();
  });
  afterEach(() => vi.useRealTimers());

  it('sends a yield and a delivery, one request each, and empties the queue', async () => {
    const { result } = setup();
    act(() => result.current.save([yieldChange(12), deliveryChange(11)]));
    await flush();
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
    expect(upsertBulk).toHaveBeenCalledWith([{ productId: 3, date: DATE, yield: 12 }], { timeout: 15000 });
    expect(updateBulk).toHaveBeenCalledWith([{ id: 91, delivery: 11 }], { timeout: 15000 });
  });

  it('waits a moment after a save so quick saves go out together', async () => {
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    act(() => result.current.save([deliveryChange(11)]));
    await flush();
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
    expect(upsertBulk).toHaveBeenCalledTimes(1);
    expect(updateBulk).toHaveBeenCalledTimes(1);
    expect(prodRows).toHaveBeenCalledTimes(1); // one drain, one check
  });

  it('does not re-read the day after a send: the write answers it', async () => {
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
    expect(prodRows).toHaveBeenCalledTimes(1); // the check before sending only
  });

  it('shows queued values over the server ones, but not flagged ones', async () => {
    server.yield = 15;
    const { result } = setup();
    act(() => result.current.save([yieldChange(12), deliveryChange(11)]));
    expect(result.current.overlayYield(DATE, 3)).toBe(12);
    expect(result.current.overlayDelivery(91)).toBe(11);
    expect(result.current.overlayYield('2026-10-24', 3)).toBeUndefined();
    await flush();
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.overlayYield(DATE, 3)).toBeUndefined();
  });

  it('does not overwrite a figure that changed on the server meanwhile', async () => {
    server.yield = 15; // an order was finalized: 10 → 15
    const { result } = setup();
    act(() => result.current.save([yieldChange(12), deliveryChange(11)]));
    await flush();
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.failed[0]).toMatchObject({
      key: `yield:${DATE}:3`,
      error: 'Changed to 15 on the server — check and save again',
    });
    expect(upsertBulk).not.toHaveBeenCalled();
    expect(updateBulk).toHaveBeenCalledWith([{ id: 91, delivery: 11 }], { timeout: 15000 });
  });

  it('checks against a fresh read, even right after the board loaded the day', async () => {
    const storage = memoryStorage();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The board has just loaded the day (yield 10)…
    qc.setQueryData(['production', DATE], [{ id: 1, branchId: 1, productId: 3, yield: 10 }]);
    qc.setQueryData(['inventory-for-production', DATE], [{ id: 91, productId: 3, delivery: 8 }]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useBoardQueue(1, { storage }), { wrapper });
    server.yield = 15; // …and an order was finalized a moment later.
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(upsertBulk).not.toHaveBeenCalled();
  });

  it('a send that landed but whose answer was lost is settled, not flagged', async () => {
    upsertBulk.mockImplementationOnce((items) => {
      server.yield = items[0].yield; // the server committed…
      return networkError(); // …but the phone never heard back
    });
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(upsertBulk).toHaveBeenCalledTimes(1));
    await flush(2000);
    await waitFor(() => expect(result.current.entries).toHaveLength(0));
    expect(result.current.failed).toHaveLength(0);
  });

  it('a correction saved while the first send is in flight is not flagged', async () => {
    let release!: () => void;
    upsertBulk.mockImplementationOnce((items) => new Promise((resolve) => {
      release = () => {
        server.yield = items[0].yield;
        resolve({ data: [{ id: 1, branchId: 1, productId: 3, yield: server.yield, date: `${DATE}T00:00:00.000Z` }] } as never);
      };
    }));
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(upsertBulk).toHaveBeenCalledTimes(1));
    act(() => result.current.save([yieldChange(13, 10)]));
    await act(async () => { release(); });
    await flush();
    await waitFor(() => expect(result.current.entries).toHaveLength(0));
    expect(result.current.failed).toHaveLength(0);
    expect(server.yield).toBe(13);
  });

  it('keeps an edit through a dropped connection and retries it', async () => {
    upsertBulk.mockImplementationOnce(networkError);
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(upsertBulk).toHaveBeenCalledTimes(1));
    expect(result.current.waiting).toHaveLength(1);
    await flush(2000);
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
  });

  it('keeps everything when the session has ended', async () => {
    upsertBulk.mockImplementation(() => status(401));
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(upsertBulk).toHaveBeenCalledTimes(1));
    expect(result.current.waiting).toHaveLength(1);
    expect(result.current.failed).toHaveLength(0);
  });

  it('flags a change the server refuses', async () => {
    upsertBulk.mockImplementation(() => status(400));
    const { result } = setup();
    act(() => result.current.save([yieldChange(12)]));
    await flush();
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(result.current.failed[0].error).toBe('no');
  });
});
