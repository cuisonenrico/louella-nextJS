'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { inventoryApi, productionApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import type { Inventory, Production } from '@/types';
import { kitchenRowsByProduct } from '@/app/(app)/production/lib/kitchenRows';
import { BACKOFF_MS, classifyError } from './countQueue';
import {
  conflicts,
  createBoardStore,
  discardBoard,
  enqueueBoard,
  markBoardFailed,
  serverFigureOf,
  settleBoard,
  type BoardChange,
  type BoardEntry,
  type ServerFigures,
} from './boardQueue';

const SEND_TIMEOUT_MS = 15000;

/** The day's rows as the server has them now; also refreshes the board's cache. */
async function serverDays(qc: QueryClient, dates: string[]): Promise<ServerFigures> {
  const days = await Promise.all(
    dates.map(async (date) => {
      const [prod, inv] = await Promise.all([
        qc.fetchQuery({
          queryKey: ['production', date],
          queryFn: () => productionApi.byDateRange(date).then((r) => r.data as Production[]),
          staleTime: 0,
        }),
        qc.fetchQuery({
          queryKey: ['inventory-for-production', date],
          queryFn: () => inventoryApi.byDateRange(date).then((r) => r.data as Inventory[]),
          staleTime: 0,
        }),
      ]);
      return { date, prod, inv };
    }),
  );
  return {
    yieldOf: (date, productId) => {
      const prod = days.find((d) => d.date === date)?.prod;
      return prod ? kitchenRowsByProduct(prod).get(productId)?.yield : undefined;
    },
    deliveryOf: (inventoryId) => {
      for (const d of days) {
        const row = d.inv.find((i) => i.id === inventoryId);
        if (row) return row.delivery;
      }
      return undefined;
    },
  };
}

async function send(batch: BoardEntry[]) {
  const yields = batch.filter((e) => e.kind === 'yield');
  const deliveries = batch.filter((e) => e.kind === 'delivery');
  if (yields.length > 0) {
    await productionApi.upsertBulk(
      yields.map((e) => ({ productId: e.productId, date: e.date, yield: e.value })),
      { timeout: SEND_TIMEOUT_MS },
    );
  }
  if (deliveries.length > 0) {
    await inventoryApi.updateBulk(deliveries.map((e) => ({ id: e.inventoryId!, delivery: e.value })), { timeout: SEND_TIMEOUT_MS });
  }
}

/**
 * The phone production board's save path, built like `useCountQueue`: every
 * save lands in the per-user board queue and is sent from there, with the same
 * triggers, backoff and failure handling. Before sending, it checks each entry
 * against the server's current figure and flags any that moved, so a late send
 * never undoes an order finalized while the phone had no signal.
 */
export function useBoardQueue(userId: number | null, opts: { storage?: Storage } = {}) {
  const qc = useQueryClient();
  const { storage } = opts;
  const store = useMemo(() => (userId == null ? null : createBoardStore(userId, storage)), [userId, storage]);

  const [entries, setEntries] = useState<BoardEntry[]>(() => store?.read() ?? []);
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
    (next: BoardEntry[]) => {
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
    const dates = [...new Set(batch.map((e) => e.date))];
    try {
      const server = await serverDays(qc, dates);
      const moved = conflicts(batch, server);
      let current = store.read();
      for (const e of moved) {
        current = markBoardFailed(current, e.key, `Changed to ${serverFigureOf(e, server)} on the server — check and save again`);
      }
      if (moved.length > 0) commit(current);
      const ready = batch.filter((e) => !moved.includes(e));

      if (ready.length > 0) {
        try {
          await send(ready);
          await serverDays(qc, dates);
          commit(settleBoard(store.read(), ready));
          delivered = true;
        } catch (err) {
          const kind = classifyError(err);
          if (kind === 'retry') retry = true;
          else if (kind === 'auth') signedOut = true;
          else {
            // One request per kind is one transaction each, so a single bad row refused its batch.
            for (const entry of ready) {
              try {
                if (ready.length > 1) await send([entry]);
                else throw err;
                commit(settleBoard(store.read(), [entry]));
                delivered = true;
              } catch (rowErr) {
                const rowKind = ready.length > 1 ? classifyError(rowErr) : 'reject';
                if (rowKind === 'reject') {
                  const now = store.read().find((e) => e.key === entry.key);
                  if (now?.rev === entry.rev) commit(markBoardFailed(store.read(), entry.key, extractError(rowErr)));
                } else {
                  retry = rowKind === 'retry';
                  signedOut = rowKind === 'auth';
                  break;
                }
              }
            }
            if (delivered) await serverDays(qc, dates).catch(() => undefined);
          }
        }
      }
    } catch (err) {
      // Could not read the server's figures (no signal, throttled): try again later.
      const kind = classifyError(err);
      if (kind === 'auth') signedOut = true;
      else retry = true;
    } finally {
      inFlight.current = false;
      setSending(false);
    }

    if (delivered) {
      step.current = 0;
      void qc.invalidateQueries({ queryKey: ['inventory'] });
    }
    if (retry) {
      const delay = BACKOFF_MS[Math.min(step.current, BACKOFF_MS.length - 1)];
      step.current += 1;
      timer.current = setTimeout(() => void drainRef.current(), delay);
    } else if (!signedOut && delivered && store.read().some((e) => !e.error)) {
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
    (changes: BoardChange[]) => {
      if (!store || changes.length === 0) return;
      let next = store.read();
      for (const c of changes) next = enqueueBoard(next, c);
      commit(next);
      void drainRef.current();
    },
    [store, commit],
  );

  const discard = useCallback(
    (key: string) => {
      if (store) commit(discardBoard(store.read(), key));
    },
    [store, commit],
  );

  const overlayYield = useCallback(
    (date: string, productId: number) => entries.find((e) => e.kind === 'yield' && e.date === date && e.productId === productId)?.value,
    [entries],
  );
  const overlayDelivery = useCallback(
    (inventoryId: number) => entries.find((e) => e.kind === 'delivery' && e.inventoryId === inventoryId)?.value,
    [entries],
  );

  return {
    entries,
    waiting: useMemo(() => entries.filter((e) => !e.error), [entries]),
    failed: useMemo(() => entries.filter((e) => !!e.error), [entries]),
    overlayYield,
    overlayDelivery,
    save,
    discard,
    sending,
    persistent: store?.persistent ?? true,
  };
}
