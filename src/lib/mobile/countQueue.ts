import type { CountFields } from '@/lib/inventory/rowFigures';

/**
 * Counts typed on a phone, waiting to reach the server.
 *
 * Branch signal drops. A count is written here first and sent from here, so a
 * dropped request, a reload or a closed tab never loses it. Values are the
 * absolute figures the person typed, so sending one twice is harmless.
 *
 * Only counts are stored — never a token (see `src/lib/tokenStore.ts`). The
 * key carries the user id, so on a shared phone one manager's counts are never
 * sent under another's login.
 */
export type QueueEntry = CountFields & {
  inventoryId: number;
  /** Bumped on every save, so a send can tell whether the entry changed meanwhile. */
  rev: number;
  /** The server refused it; kept until the person edits or discards it. */
  error?: string;
};

export interface QueueStore<T> {
  read(): T[];
  write(entries: T[]): void;
  /** False when storage is unavailable and entries last only as long as the page. */
  persistent: boolean;
}

export type CountQueueStore = QueueStore<QueueEntry>;

export const countQueueKey = (userId: number) => `louella:count-queue:v1:${userId}`;

/** Retry delays after a failed send; the last one repeats. */
export const BACKOFF_MS = [2000, 5000, 15000, 30000] as const;

const memory = new Map<string, unknown[]>();

export function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * A list kept in localStorage under one key, falling back to memory when storage
 * is unavailable. Storage is the shared truth across tabs.
 */
export function createQueueStore<T>(key: string, storage: Storage | undefined = browserStorage()): QueueStore<T> {
  let persistent = !!storage;
  const store: QueueStore<T> = {
    get persistent() {
      return persistent;
    },
    read() {
      if (persistent && storage) {
        try {
          const raw = storage.getItem(key);
          // Storage is the shared truth across tabs: a missing key means another
          // tab sent everything, not that this tab's memory is still current.
          if (!raw) return [];
          const parsed: unknown = JSON.parse(raw);
          return Array.isArray(parsed) ? (parsed as T[]) : [];
        } catch (err) {
          if (err instanceof SyntaxError) return [];
          persistent = false;
        }
      }
      return (memory.get(key) as T[] | undefined) ?? [];
    },
    write(entries) {
      memory.set(key, entries);
      if (!persistent || !storage) return;
      try {
        if (entries.length === 0) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(entries));
      } catch {
        persistent = false;
      }
    },
  };
  return store;
}

export function createCountStore(userId: number, storage: Storage | undefined = browserStorage()): CountQueueStore {
  return createQueueStore<QueueEntry>(countQueueKey(userId), storage);
}

/** Merge a save over the row's waiting entry (latest values win). */
export function enqueue(entries: QueueEntry[], inventoryId: number, fields: CountFields): QueueEntry[] {
  const i = entries.findIndex((e) => e.inventoryId === inventoryId);
  if (i === -1) return [...entries, { inventoryId, ...fields, rev: 1 }];
  const prev = entries[i];
  const { error: _dropped, ...rest } = prev;
  const next: QueueEntry = { ...rest, ...fields, rev: prev.rev + 1 };
  return entries.map((e, j) => (j === i ? next : e));
}

/** Drop the entries a send delivered, unless they were revised while it was in flight. */
export function settle(stored: QueueEntry[], sent: QueueEntry[]): QueueEntry[] {
  return stored.filter((e) => !sent.some((s) => s.inventoryId === e.inventoryId && s.rev === e.rev));
}

export function markFailed(entries: QueueEntry[], inventoryId: number, message: string): QueueEntry[] {
  return entries.map((e) => (e.inventoryId === inventoryId ? { ...e, error: message } : e));
}

export function discard(entries: QueueEntry[], inventoryId: number): QueueEntry[] {
  return entries.filter((e) => e.inventoryId !== inventoryId);
}

/**
 * What a failed send means for the queue: `retry` (no answer, server trouble,
 * throttled), `auth` (the session is over — keep everything until sign-in) or
 * `reject` (the server refused these values; retrying would refuse again).
 */
export function classifyError(err: unknown): 'retry' | 'auth' | 'reject' {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === undefined) return 'retry';
  if (status === 401) return 'auth';
  if (status === 429 || status >= 500) return 'retry';
  return 'reject';
}
