import { describe, expect, it } from 'vitest';
import { applied, boardKey, conflicts, createBoardStore, discardBoard, enqueueBoard, markBoardFailed, settleBoard } from './boardQueue';

function memoryStorage() {
  const ls = new Map<string, string>();
  const storage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  } as unknown as Storage;
  return { ls, storage };
}

const yieldOf = (date: string, productId: number, value: number, base: number) =>
  ({ kind: 'yield' as const, date, productId, value, base });
const deliveryOf = (inventoryId: number, productId: number, value: number, base: number) =>
  ({ kind: 'delivery' as const, date: '2026-10-25', productId, inventoryId, value, base });

describe('boardQueue', () => {
  it('keys yields by day and product, deliveries by inventory row', () => {
    expect(boardKey(yieldOf('2026-10-25', 3, 1, 0))).toBe('yield:2026-10-25:3');
    expect(boardKey(deliveryOf(91, 3, 1, 0))).toBe('delivery:91');
  });

  it('latest value wins but the first base is kept until settled', () => {
    let q = enqueueBoard([], yieldOf('2026-10-25', 3, 12, 10));
    q = enqueueBoard(q, yieldOf('2026-10-25', 3, 14, 12));
    expect(q).toEqual([{ key: 'yield:2026-10-25:3', kind: 'yield', date: '2026-10-25', productId: 3, value: 14, base: 10, rev: 2 }]);
  });

  it('keeps the same product on two days apart', () => {
    const q = enqueueBoard(enqueueBoard([], yieldOf('2026-10-24', 3, 5, 0)), yieldOf('2026-10-25', 3, 6, 0));
    expect(q).toHaveLength(2);
  });

  it('settle removes only unrevised entries; enqueue clears an error; discard drops by key', () => {
    const sent = enqueueBoard([], yieldOf('2026-10-25', 3, 12, 10));
    const revised = enqueueBoard(sent, yieldOf('2026-10-25', 3, 13, 12));
    // Revised while in flight: kept, and re-based on what the server now holds.
    expect(settleBoard(revised, sent)).toEqual([{ ...revised[0], base: 12 }]);
    expect(settleBoard(sent, sent)).toEqual([]);
    const failed = markBoardFailed(sent, 'yield:2026-10-25:3', 'Changed to 24 on the server — check and save again');
    expect(failed[0].error).toMatch(/Changed to 24/);
    expect(enqueueBoard(failed, yieldOf('2026-10-25', 3, 25, 24))[0].error).toBeUndefined();
    expect(discardBoard(failed, 'yield:2026-10-25:3')).toEqual([]);
  });

  it('a corrected entry takes the base it was corrected from', () => {
    const failed = markBoardFailed(enqueueBoard([], yieldOf('2026-10-25', 3, 12, 10)), 'yield:2026-10-25:3', 'x');
    expect(enqueueBoard(failed, yieldOf('2026-10-25', 3, 25, 24))[0].base).toBe(24);
  });

  it('flags entries whose server figure moved away from where the person started', () => {
    const q = enqueueBoard(enqueueBoard([], yieldOf('2026-10-25', 3, 12, 10)), deliveryOf(91, 3, 8, 8));
    const server = { yieldOf: () => 15, deliveryOf: () => 8 };
    expect(conflicts(q, server).map((e) => e.key)).toEqual(['yield:2026-10-25:3']);
    expect(conflicts(q, { yieldOf: () => 10, deliveryOf: () => undefined })).toEqual([]);
  });

  it('finds entries the server already holds', () => {
    const q = enqueueBoard(enqueueBoard([], yieldOf('2026-10-25', 3, 12, 10)), deliveryOf(91, 3, 8, 6));
    expect(applied(q, { yieldOf: () => 12, deliveryOf: () => 7 }).map((e) => e.key)).toEqual(['yield:2026-10-25:3']);
  });

  it('a yield with no server row yet counts as 0', () => {
    const q = enqueueBoard([], yieldOf('2026-10-25', 3, 12, 0));
    expect(conflicts(q, { yieldOf: () => undefined, deliveryOf: () => undefined })).toEqual([]);
  });

  it('store is per user and survives corrupt data', () => {
    const { ls, storage } = memoryStorage();
    createBoardStore(1, storage).write(enqueueBoard([], yieldOf('2026-10-25', 3, 12, 10)));
    expect(createBoardStore(2, storage).read()).toEqual([]);
    expect([...ls.keys()]).toEqual(['louella:board-queue:v1:1']);
    ls.set('louella:board-queue:v1:1', '{oops');
    expect(createBoardStore(1, storage).read()).toEqual([]);
  });
});
