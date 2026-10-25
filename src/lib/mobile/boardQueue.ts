import { browserStorage, createQueueStore, type QueueStore } from './countQueue';

/**
 * Production-board edits typed on a phone, waiting to reach the server: the
 * kitchen's yield for a product and day, and a branch's delivery row.
 *
 * Each entry keeps `base`, the server figure the person started from. Values are
 * absolute, so a late send would overwrite anything that changed meanwhile — an
 * order finalized while the phone had no signal adds to both figures. The drain
 * compares `base` with the server first and flags the entry instead of sending.
 */
export type BoardEntry = {
  key: string;
  kind: 'yield' | 'delivery';
  date: string;
  productId: number;
  inventoryId?: number;
  value: number;
  base: number;
  rev: number;
  error?: string;
};

export type BoardChange = Omit<BoardEntry, 'key' | 'rev' | 'error'>;

export const boardQueueKey = (userId: number) => `louella:board-queue:v1:${userId}`;

export function boardKey(e: Pick<BoardEntry, 'kind' | 'date' | 'productId' | 'inventoryId'>): string {
  return e.kind === 'yield' ? `yield:${e.date}:${e.productId}` : `delivery:${e.inventoryId}`;
}

export function createBoardStore(userId: number, storage: Storage | undefined = browserStorage()): QueueStore<BoardEntry> {
  return createQueueStore<BoardEntry>(boardQueueKey(userId), storage);
}

/**
 * Latest value wins. The base stays the one the person first started from, so
 * a second edit before the send still checks against the server's original
 * figure — unless the entry was flagged, in which case the person corrected it
 * from the new server figure and that becomes the base.
 */
export function enqueueBoard(entries: BoardEntry[], change: BoardChange): BoardEntry[] {
  const key = boardKey(change);
  const i = entries.findIndex((e) => e.key === key);
  if (i === -1) return [...entries, { key, ...change, rev: 1 }];
  const prev = entries[i];
  const next: BoardEntry = {
    ...change,
    key,
    base: prev.error ? change.base : prev.base,
    rev: prev.rev + 1,
  };
  return entries.map((e, j) => (j === i ? next : e));
}

export function settleBoard(stored: BoardEntry[], sent: BoardEntry[]): BoardEntry[] {
  return stored.filter((e) => !sent.some((s) => s.key === e.key && s.rev === e.rev));
}

export function markBoardFailed(entries: BoardEntry[], key: string, message: string): BoardEntry[] {
  return entries.map((e) => (e.key === key ? { ...e, error: message } : e));
}

export function discardBoard(entries: BoardEntry[], key: string): BoardEntry[] {
  return entries.filter((e) => e.key !== key);
}

export interface ServerFigures {
  /** The stored yield, or undefined when the day has no row for the product (treated as 0). */
  yieldOf(date: string, productId: number): number | undefined;
  /** The stored delivery, or undefined when the row is not known (not checked). */
  deliveryOf(inventoryId: number): number | undefined;
}

/** Entries whose server figure moved away from where the person started. */
export function conflicts(entries: BoardEntry[], server: ServerFigures): BoardEntry[] {
  return entries.filter((e) => {
    const now = e.kind === 'yield' ? (server.yieldOf(e.date, e.productId) ?? 0) : server.deliveryOf(e.inventoryId!);
    return now !== undefined && now !== e.base;
  });
}

export function serverFigureOf(e: BoardEntry, server: ServerFigures): number | undefined {
  return e.kind === 'yield' ? (server.yieldOf(e.date, e.productId) ?? 0) : server.deliveryOf(e.inventoryId!);
}
