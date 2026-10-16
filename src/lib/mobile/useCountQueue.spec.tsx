import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventoryApi } from '@/lib/apiServices';
import { createCountStore, enqueue } from './countQueue';
import { useCountQueue } from './useCountQueue';

vi.mock('@/lib/apiServices', () => ({ inventoryApi: { updateBulk: vi.fn() } }));
const updateBulk = vi.mocked(inventoryApi.updateBulk);

const ok = () => Promise.resolve({ data: { updated: 1, cascadeUpdated: 0 } } as never);
const networkError = () => Promise.reject({ isAxiosError: true, request: {}, message: 'Network Error' });
const status = (code: number, message = 'Bad value') =>
  Promise.reject({ isAxiosError: true, response: { status: code, data: { message } } });

function memoryStorage(): Storage {
  const ls = new Map<string, string>();
  return {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  } as unknown as Storage;
}

function setup(storage: Storage) {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return renderHook(() => useCountQueue(1, { storage }), { wrapper });
}

describe('useCountQueue', () => {
  beforeEach(() => {
    updateBulk.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => vi.useRealTimers());

  it('sends a save and empties the queue once the server has it', async () => {
    updateBulk.mockImplementation(ok);
    const { result } = setup(memoryStorage());
    act(() => result.current.save(7, { leftover: 3 }));
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
    expect(updateBulk).toHaveBeenCalledWith([{ id: 7, leftover: 3 }]);
  });

  it('keeps a count through a dropped connection and retries it', async () => {
    updateBulk.mockImplementationOnce(networkError).mockImplementation(ok);
    const { result } = setup(memoryStorage());
    act(() => result.current.save(7, { leftover: 3 }));
    await waitFor(() => expect(updateBulk).toHaveBeenCalledTimes(1));
    expect(result.current.waiting).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
    expect(updateBulk).toHaveBeenCalledTimes(2);
  });

  it('sends everything already queued on load, one batch, then isolates a refused row', async () => {
    const storage = memoryStorage();
    createCountStore(1, storage).write(enqueue(enqueue([], 7, { leftover: 3 }), 8, { reject: 2 }));
    updateBulk.mockImplementation((items) =>
      items.length > 1 ? status(400) : items[0].id === 8 ? status(400, 'Reject is more than on hand') : ok(),
    );
    const { result } = setup(storage);
    await waitFor(() => expect(result.current.failed).toHaveLength(1));
    expect(updateBulk.mock.calls[0][0]).toEqual([{ id: 7, leftover: 3 }, { id: 8, reject: 2 }]);
    expect(result.current.failed[0]).toMatchObject({ inventoryId: 8, error: 'Reject is more than on hand' });
    expect(result.current.waiting).toHaveLength(0);
  });

  it('sends again when the browser comes back online', async () => {
    updateBulk.mockImplementationOnce(networkError).mockImplementation(ok);
    const { result } = setup(memoryStorage());
    act(() => result.current.save(7, { leftover: 3 }));
    await waitFor(() => expect(updateBulk).toHaveBeenCalledTimes(1));
    act(() => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(result.current.waiting).toHaveLength(0));
  });

  it('keeps everything when the session has ended', async () => {
    updateBulk.mockImplementation(() => status(401));
    const { result } = setup(memoryStorage());
    act(() => result.current.save(7, { leftover: 3 }));
    await waitFor(() => expect(updateBulk).toHaveBeenCalledTimes(1));
    expect(result.current.waiting).toHaveLength(1);
    expect(result.current.failed).toHaveLength(0);
  });

  it('overlays waiting and refused values, and discard drops one', async () => {
    updateBulk.mockImplementation(networkError);
    const { result } = setup(memoryStorage());
    act(() => result.current.save(7, { leftover: 3 }));
    expect(result.current.overlay.get(7)).toEqual({ leftover: 3 });
    act(() => result.current.discard(7));
    expect(result.current.entries).toHaveLength(0);
  });
});
