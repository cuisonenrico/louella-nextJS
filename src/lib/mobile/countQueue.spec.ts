import { describe, expect, it } from 'vitest';
import { classifyError, createCountStore, discard, enqueue, markFailed, settle } from './countQueue';

function memoryStorage() {
  const ls = new Map<string, string>();
  const storage = {
    getItem: (k: string) => ls.get(k) ?? null,
    setItem: (k: string, v: string) => void ls.set(k, v),
    removeItem: (k: string) => void ls.delete(k),
  } as unknown as Storage;
  return { ls, storage };
}

describe('countQueue', () => {
  it('latest values win and rev increments', () => {
    let q = enqueue([], 7, { leftover: 3 });
    q = enqueue(q, 7, { reject: 1 });
    expect(q).toEqual([{ inventoryId: 7, leftover: 3, reject: 1, rev: 2 }]);
  });

  it('keeps one entry per row', () => {
    const q = enqueue(enqueue(enqueue([], 7, { leftover: 3 }), 8, { reject: 2 }), 7, { leftover: 4 });
    expect(q.map((e) => [e.inventoryId, e.leftover])).toEqual([[7, 4], [8, undefined]]);
  });

  it('settle keeps an entry revised during the request', () => {
    const sent = enqueue([], 7, { leftover: 3 }); // rev 1
    const stored = enqueue(sent, 7, { leftover: 4 }); // rev 2, written by another tab
    expect(settle(stored, sent)).toEqual(stored);
  });

  it('settle removes entries sent unchanged', () => {
    const q = enqueue(enqueue([], 7, { leftover: 3 }), 8, { reject: 2 });
    expect(settle(q, q)).toEqual([]);
  });

  it('enqueue clears a previous error', () => {
    const q = markFailed(enqueue([], 7, { leftover: 3 }), 7, 'Bad value');
    expect(q[0].error).toBe('Bad value');
    expect(enqueue(q, 7, { leftover: 2 })[0].error).toBeUndefined();
  });

  it('discard drops the row', () => {
    const q = enqueue(enqueue([], 7, { leftover: 3 }), 8, { reject: 2 });
    expect(discard(q, 7).map((e) => e.inventoryId)).toEqual([8]);
  });

  it.each([
    [undefined, 'retry'],
    [500, 'retry'],
    [503, 'retry'],
    [429, 'retry'],
    [401, 'auth'],
    [400, 'reject'],
    [403, 'reject'],
    [404, 'reject'],
  ] as const)('classifies status %s as %s', (status, kind) => {
    const err = status ? { isAxiosError: true, response: { status } } : { isAxiosError: true, request: {} };
    expect(classifyError(err)).toBe(kind);
  });

  it('store is per user', () => {
    const { ls, storage } = memoryStorage();
    createCountStore(1, storage).write(enqueue([], 7, { leftover: 1 }));
    expect(createCountStore(2, storage).read()).toEqual([]);
    expect(createCountStore(1, storage).read()).toHaveLength(1);
    expect([...ls.keys()]).toEqual(['louella:count-queue:v1:1']);
  });

  it('store reads what another tab left, not its own memory', () => {
    const { ls, storage } = memoryStorage();
    createCountStore(1, storage).write(enqueue([], 7, { leftover: 1 }));
    ls.delete('louella:count-queue:v1:1'); // another tab sent and cleared it
    expect(createCountStore(1, storage).read()).toEqual([]);
  });

  it('store ignores corrupt data', () => {
    const { ls, storage } = memoryStorage();
    ls.set('louella:count-queue:v1:1', '{not json');
    expect(createCountStore(1, storage).read()).toEqual([]);
  });

  it('store falls back to memory when storage throws', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    const mem = createCountStore(1, broken);
    mem.write(enqueue([], 7, { leftover: 1 }));
    expect(mem.persistent).toBe(false);
    expect(mem.read()).toHaveLength(1);
  });
});
