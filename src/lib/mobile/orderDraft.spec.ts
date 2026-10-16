import { describe, expect, it } from 'vitest';
import { clearOrderDraft, loadOrderDraft, orderDraftKey, saveOrderDraft } from './orderDraft';

function memoryStorage() {
  const ls = new Map<string, string>();
  const storage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  } as unknown as Storage;
  return { ls, storage };
}

const draft = { items: [[1, 7], [2, 0]] as [number, number][], notes: 'extra for fiesta', savedAt: '2026-10-16T01:12:00Z' };

describe('orderDraft', () => {
  it('keys a draft by user, branch, day and order', () => {
    expect(orderDraftKey({ userId: 3, branchId: 5, date: '2026-10-16', orderId: null })).toBe(
      'louella:order-draft:v1:3:5:2026-10-16:new',
    );
    expect(orderDraftKey({ userId: 3, branchId: 5, date: '2026-10-16', orderId: 212 })).toBe(
      'louella:order-draft:v1:3:5:2026-10-16:212',
    );
  });

  it('round-trips and clears', () => {
    const { storage } = memoryStorage();
    saveOrderDraft('k', draft, storage);
    expect(loadOrderDraft('k', storage)).toEqual(draft);
    clearOrderDraft('k', storage);
    expect(loadOrderDraft('k', storage)).toBeNull();
  });

  it('ignores corrupt or foreign data', () => {
    const { ls, storage } = memoryStorage();
    ls.set('k', '{not json');
    expect(loadOrderDraft('k', storage)).toBeNull();
    ls.set('k', JSON.stringify({ hello: 1 }));
    expect(loadOrderDraft('k', storage)).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    expect(() => saveOrderDraft('k', draft, broken)).not.toThrow();
    expect(loadOrderDraft('k', broken)).toBeNull();
    expect(() => clearOrderDraft('k', broken)).not.toThrow();
  });
});
