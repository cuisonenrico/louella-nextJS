import { Prisma } from '@prisma/client';
import {
  computeAdjSum,
  computeMaterialClosing,
} from './inventory-metrics.util';
import { recordChanges, type AuditEntry } from './audit.util';
import { num } from './decimal.util';

/**
 * Keeps each day's opening stock equal to the previous day's close.
 *
 * Opening stock is stored on every row (`quantity`), so it can go stale: a
 * corrected leftover, a late delivery, a transfer, a deleted day — any change
 * to one day's close has to reach the next day's opening, and through
 * uncounted days, the days after that. That used to happen only on the two
 * PATCH paths, and stopped at the first hand-entered day. The rule now
 * (decision 2026-09-19) is simply:
 *
 *   opening[d] = close[d − 1]   for every day that has a previous day
 *
 * where, for finished goods,
 *   close = leftover                                    on a counted day
 *   close = opening + delivery + Σadj − reject          on a placeholder
 *           (nobody counted it, so nothing is assumed sold)
 * and, for materials (which have no counted close),
 *   close = max(0, opening + delivery + Σadj − used)     (computeMaterialClosing)
 *
 * The first day a product ever has keeps the opening it was given.
 *
 * Every writer calls these inside its own transaction, passing the earliest
 * date it touched. The walk stops at the first later day that was already
 * consistent, because nothing after it can have changed. `full: true` walks
 * the whole chain regardless — used to repair history.
 */

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Chain locks
// ---------------------------------------------------------------------------

/**
 * Serialise writers on the same stock chain.
 *
 * Carry-forward reads a chain and rewrites it; so do the stock-cap checks
 * (read what is on hand, then book a pull-out) and production (read the old
 * yield, then consume the difference). Two of those interleaving on one chain
 * under READ COMMITTED each act on a view the other is about to invalidate:
 * two pull-outs of the last unit both pass, two production saves both consume
 * the full yield. A transaction-scoped advisory lock per chain makes them
 * queue instead. It is released at commit or rollback, so it cannot leak, and
 * works through Supabase's transaction pooler because it never outlives the
 * transaction.
 *
 * Lock order is fixed to rule out deadlock: production, then materials, then
 * finished goods — the order a production-order finalization touches them —
 * and within one kind, sorted. Every writer takes its locks through these
 * helpers, before it reads anything it will base a write on. Re-taking a lock
 * already held in the same transaction is a no-op.
 */
const LOCK_NS = { production: 1, material: 2, inventory: 3 } as const;

async function advisoryLock(
  tx: Tx,
  ns: (typeof LOCK_NS)[keyof typeof LOCK_NS],
  keys: string[],
): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ns}::int, hashtext(${key}))`;
  }
}

/** Lock finished-goods chains, one per (branch, product). */
export function lockInventoryChains(
  tx: Tx,
  pairs: Array<{ branchId: number; productId: number }>,
): Promise<void> {
  return advisoryLock(tx, LOCK_NS.inventory, pairs.map((p) => `${p.branchId}:${p.productId}`));
}

/** Lock material stock-card chains, one per material. */
export function lockMaterialChains(tx: Tx, materialIds: number[]): Promise<void> {
  return advisoryLock(tx, LOCK_NS.material, materialIds.map(String));
}

/** Lock production rows by their (branch, product, day) key. */
export function lockProductionKeys(
  tx: Tx,
  keys: Array<{ branchId: number; productId: number; date: Date }>,
): Promise<void> {
  return advisoryLock(
    tx,
    LOCK_NS.production,
    keys.map((k) => `${k.branchId}:${k.productId}:${k.date.toISOString().slice(0, 10)}`),
  );
}

export interface ChainOptions {
  /** Walk every later day instead of stopping at the first consistent one. */
  full?: boolean;
  /**
   * Whose write caused the carry-forward, for the change history. Every day
   * rewritten here is recorded as a `carry-forward` event.
   */
  userId?: number | null;
}

// ---------------------------------------------------------------------------
// Finished goods (Inventory)
// ---------------------------------------------------------------------------

export interface InventoryChainStart {
  branchId: number;
  productId: number;
  fromDate: Date;
}

/**
 * Reconcile the finished-goods chain for each (branch, product) from its
 * `fromDate` onwards. Returns the number of rows rewritten.
 *
 * Two reads for any number of chains: every live row from the earliest start
 * date, and (DISTINCT ON) each chain's last row before that date.
 */
export async function reconcileInventoryChains(
  tx: Tx,
  starts: InventoryChainStart[],
  opts: ChainOptions = {},
): Promise<number> {
  const fromByPair = new Map<string, Date>();
  for (const s of starts) {
    const key = `${s.branchId}:${s.productId}`;
    const prev = fromByPair.get(key);
    if (!prev || s.fromDate < prev) fromByPair.set(key, s.fromDate);
  }
  if (fromByPair.size === 0) return 0;

  await lockInventoryChains(tx, starts);

  const branchIds = [...new Set(starts.map((s) => s.branchId))];
  const productIds = [...new Set(starts.map((s) => s.productId))];
  const earliest = new Date(
    Math.min(...[...fromByPair.values()].map((d) => d.getTime())),
  );

  const [anchors, rows] = await Promise.all([
    tx.$queryRaw<Array<{ branchId: number; productId: number; leftover: number }>>`
      SELECT DISTINCT ON ("branchId", "productId") "branchId", "productId", "leftover"
      FROM "Inventory"
      WHERE "branchId" IN (${Prisma.join(branchIds)})
        AND "productId" IN (${Prisma.join(productIds)})
        AND "date" < ${earliest}
        AND "deletedAt" IS NULL
      ORDER BY "branchId", "productId", "date" DESC
    `,
    tx.inventory.findMany({
      where: {
        branchId: { in: branchIds },
        productId: { in: productIds },
        date: { gte: earliest },
        deletedAt: null,
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        branchId: true,
        productId: true,
        date: true,
        quantity: true,
        delivery: true,
        leftover: true,
        reject: true,
        isAutoGenerated: true,
        adjustments: {
          where: { deletedAt: null },
          select: { type: true, value: true },
        },
      },
    }),
  ]);

  const anchorByPair = new Map(
    anchors.map((a) => [`${a.branchId}:${a.productId}`, a.leftover]),
  );
  const rowsByPair = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.branchId}:${row.productId}`;
    if (!fromByPair.has(key)) continue; // cross-product of the IN lists
    const list = rowsByPair.get(key) ?? [];
    list.push(row);
    rowsByPair.set(key, list);
  }

  let written = 0;
  const audit: AuditEntry[] = [];
  for (const [key, fromDate] of fromByPair) {
    let previousClose = anchorByPair.get(key);
    let walked = 0;
    for (const row of rowsByPair.get(key) ?? []) {
      if (row.date < fromDate) {
        // Before this chain's start: nothing to fix, it only sets the close.
        previousClose = row.leftover;
        continue;
      }
      const opening = previousClose ?? row.quantity;
      const close = row.isAutoGenerated
        ? opening + row.delivery + computeAdjSum(row.adjustments) - row.reject
        : row.leftover;

      if (row.quantity !== opening || row.leftover !== close) {
        await tx.inventory.update({
          where: { id: row.id },
          data: { quantity: opening, leftover: close },
        });
        audit.push({
          entity: 'Inventory',
          entityId: row.id,
          action: 'carry-forward',
          before: row,
          after: { ...row, quantity: opening, leftover: close },
        });
        written++;
      } else if (walked > 0 && !opts.full) {
        break; // unchanged, and so is everything it feeds
      }
      walked++;
      previousClose = close;
    }
  }
  await recordChanges(tx, audit, opts.userId);
  return written;
}

// ---------------------------------------------------------------------------
// Materials (MaterialInventory)
// ---------------------------------------------------------------------------

export interface MaterialChainStart {
  materialId: number;
  fromDate: Date;
}

/** Floats: treat sub-micro differences as equal rather than rewrite forever. */
const EPSILON = 1e-9;

/**
 * Reconcile each material's stock-card chain from `fromDate` onwards.
 * Returns the number of cards rewritten.
 */
export async function reconcileMaterialChains(
  tx: Tx,
  starts: MaterialChainStart[],
  opts: ChainOptions = {},
): Promise<number> {
  const byMaterial = new Map<number, Date>();
  for (const s of starts) {
    const prev = byMaterial.get(s.materialId);
    if (!prev || s.fromDate < prev) byMaterial.set(s.materialId, s.fromDate);
  }
  await lockMaterialChains(tx, [...byMaterial.keys()]);

  let written = 0;
  for (const [materialId, fromDate] of byMaterial) {
    written += await reconcileOneMaterialChain(tx, materialId, fromDate, opts);
  }
  return written;
}

const materialCardSelect = {
  id: true,
  quantity: true,
  delivery: true,
  used: true,
  adjustments: {
    where: { deletedAt: null },
    select: { type: true, value: true },
  },
} as const;

async function reconcileOneMaterialChain(
  tx: Tx,
  materialId: number,
  fromDate: Date,
  opts: ChainOptions,
): Promise<number> {
  const anchor = await tx.materialInventory.findFirst({
    where: { materialId, date: { lt: fromDate }, deletedAt: null },
    orderBy: { date: 'desc' },
    select: materialCardSelect,
  });
  const cards = await tx.materialInventory.findMany({
    where: { materialId, date: { gte: fromDate }, deletedAt: null },
    orderBy: { date: 'asc' },
    select: materialCardSelect,
  });

  let written = 0;
  let previousClose: number | undefined = anchor
    ? computeMaterialClosing(anchor)
    : undefined;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const opening = previousClose ?? num(card.quantity);

    if (Math.abs(num(card.quantity) - opening) > EPSILON) {
      await tx.materialInventory.update({
        where: { id: card.id },
        data: { quantity: opening },
      });
      await recordChanges(
        tx,
        [{
          entity: 'MaterialInventory',
          entityId: card.id,
          action: 'carry-forward',
          before: card,
          after: { ...card, quantity: opening },
        }],
        opts.userId,
      );
      written++;
    } else if (i > 0 && !opts.full) {
      break;
    }
    previousClose = computeMaterialClosing({ ...card, quantity: opening });
  }
  return written;
}
