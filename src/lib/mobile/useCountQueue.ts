'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import type { CountFields } from '@/lib/inventory/rowFigures';
import type { InventoryBulkUpdateItem } from '@/types';
import { BRANCH_CASH_KEY } from '@/components/branch-cash/BranchCashPanel';
import {
  BACKOFF_MS,
  classifyError,
  createCountStore,
  discard as discardEntry,
  enqueue,
  markFailed,
  settle,
  type QueueEntry,
} from './countQueue';

const toItem = ({ inventoryId, delivery, leftover, reject }: QueueEntry): InventoryBulkUpdateItem => ({
  id: inventoryId,
  ...(delivery !== undefined && { delivery }),
  ...(leftover !== undefined && { leftover }),
  ...(reject !== undefined && { reject }),
});

/**
 * The phone count's save path: every save lands in the per-user queue
 * (`countQueue.ts`) and is sent from there as one `PATCH /inventory/bulk`.
 *
 * Sends again after a save, when the browser comes back online, when the tab
 * is shown again, on load and on a backoff timer. One send at a time. A batch
 * the server refuses is re-sent row by row, so one bad row cannot hold the
 * rest of the count hostage; the refused rows wait for the person to edit or
 * discard them.
 */
export function useCountQueue(userId: number | null, opts: { storage?: Storage } = {}) {
  const qc = useQueryClient();
  const { storage } = opts;
  const store = useMemo(() => (userId == null ? null : createCountStore(userId, storage)), [userId, storage]);

  const [entries, setEntries] = useState<QueueEntry[]>(() => store?.read() ?? []);
  const [storeSeen, setStoreSeen] = useState(store);
  if (storeSeen !== store) {
    setStoreSeen(store);
    setEntries(store?.read() ?? []);
  }

  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const step = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drainRef = useRef<() => Promise<void>>(async () => {});

  const commit = useCallback(
    (next: QueueEntry[]) => {
      store?.write(next);
      setEntries(next);
    },
    [store],
  );

  const drain = useCallback(async () => {
    if (!store || inFlight.current) return;
    const batch = store.read().filter((e) => !e.error);
    if (batch.length === 0) return;
    inFlight.current = true;
    setSending(true);
    clearTimeout(timer.current);

    let delivered = false;
    let retry = false;
    let signedOut = false;
    try {
      await inventoryApi.updateBulk(batch.map(toItem));
      commit(settle(store.read(), batch));
      delivered = true;
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'retry') retry = true;
      else if (kind === 'reject') {
        // The batch is one transaction, so a single bad row refused all of it.
        for (const entry of batch) {
          try {
            if (batch.length > 1) await inventoryApi.updateBulk([toItem(entry)]);
            else throw err;
            commit(settle(store.read(), [entry]));
            delivered = true;
          } catch (rowErr) {
            const rowKind = batch.length > 1 ? classifyError(rowErr) : 'reject';
            if (rowKind === 'reject') {
              const current = store.read().find((e) => e.inventoryId === entry.inventoryId);
              // Revised while in flight: send the new values instead of flagging the old.
              if (current?.rev === entry.rev) commit(markFailed(store.read(), entry.inventoryId, extractError(rowErr)));
            } else {
              retry = rowKind === 'retry';
              signedOut = rowKind === 'auth';
              break;
            }
          }
        }
      }
      // api.ts sends the person to sign in; the queue waits for them.
      if (kind === 'auth') signedOut = true;
    } finally {
      inFlight.current = false;
      setSending(false);
    }

    if (delivered) {
      step.current = 0;
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      qc.invalidateQueries({ queryKey: BRANCH_CASH_KEY });
    }
    if (retry) {
      const delay = BACKOFF_MS[Math.min(step.current, BACKOFF_MS.length - 1)];
      step.current += 1;
      timer.current = setTimeout(() => void drainRef.current(), delay);
    } else if (!signedOut && store.read().some((e) => !e.error)) {
      // Saved again while this send was in flight.
      void drainRef.current();
    }
  }, [store, commit, qc]);

  useEffect(() => {
    drainRef.current = drain;
  }, [drain]);

  useEffect(() => {
    if (!store) return;
    const kick = () => void drainRef.current();
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    // Another tab saved or sent: show what is really waiting.
    const onStorage = () => setEntries(store.read());
    kick();
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
      clearTimeout(timer.current);
    };
  }, [store]);

  const save = useCallback(
    (inventoryId: number, fields: CountFields) => {
      if (!store) return;
      commit(enqueue(store.read(), inventoryId, fields));
      void drainRef.current();
    },
    [store, commit],
  );

  const discard = useCallback(
    (inventoryId: number) => {
      if (store) commit(discardEntry(store.read(), inventoryId));
    },
    [store, commit],
  );

  const overlay = useMemo(() => {
    const map = new Map<number, CountFields>();
    for (const { inventoryId, delivery, leftover, reject } of entries) {
      map.set(inventoryId, {
        ...(delivery !== undefined && { delivery }),
        ...(leftover !== undefined && { leftover }),
        ...(reject !== undefined && { reject }),
      });
    }
    return map;
  }, [entries]);

  return {
    entries,
    waiting: useMemo(() => entries.filter((e) => !e.error), [entries]),
    failed: useMemo(() => entries.filter((e) => !!e.error), [entries]),
    overlay,
    save,
    discard,
    sending,
    persistent: store?.persistent ?? true,
  };
}
