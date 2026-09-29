import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  getEffectivePrice,
  loadPriceHistory,
  revenueCentavos,
  type PriceHistoryMap,
} from '../common/utils/price-history.util';
import { pesos } from '../common/utils/decimal.util';
import {
  computeAdjSum,
  computeSold,
} from '../common/utils/inventory-metrics.util';
import { csvField } from '../common/utils/csv.util';
import {
  lockInventoryChains,
  reconcileInventoryChains,
} from '../common/utils/stock-chain';
import { recordChanges, type AuditEntry } from '../common/utils/audit.util';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-bulk.dto';
import { CacheNamespaceService } from '../common/cache/cache-namespace.service';
import { CACHE_NS } from '../common/cache/cache-namespaces';
import { clampPageSize } from '../common/constants/inventory.constants';
import {
  MAX_REPORT_RANGE_DAYS,
  assertDateRange,
  eachDayInclusive,
  toUtcDay,
} from '../common/utils/date-range.util';

/**
 * A later day still derived from an older count. Opening stock now always
 * follows the previous day's close, so none can remain; the type is kept for
 * the bulk-save response shape, which still carries an (empty) list.
 */
export interface CascadeWarning {
  branchId: number;
  productId: number;
  fromDate: string;
}

/** Row writes plus the carry-forward they trigger, in one transaction. */
const WRITE_TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

const withAdjustments = {
  adjustments: { where: { deletedAt: null }, select: { type: true, value: true } },
} as const;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheNamespaceService,
  ) {}

  /**
   * Returns today's calendar date as a UTC-midnight Date, resolved in Manila.
   *
   * This used to read the process timezone via `TZ=Asia/Manila`, which worked
   * on Cloud Run. **Vercel reserves `TZ` and refuses to set it**, so functions
   * always run UTC — and under UTC every call from 16:00–23:59 UTC, which is
   * **00:00–08:00 in Manila**, returned the *previous* date. That window is the
   * early-morning baking shift, so it would have been wrong precisely when the
   * inventory sheets are first opened each day.
   *
   * Pinning the zone explicitly is the only portable fix, and it matches what
   * jobs.service, autofill-on-demand, and suggestions.service already do.
   */
  private localToday(): Date {
    const str = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
    }).format(new Date());
    return new Date(`${str}T00:00:00.000Z`);
  }

  /**
   * Reject a row that claims more stock left over than ever existed.
   *
   * `sold = quantity + delivery + adjSum - leftover - reject`, so an entry
   * where leftover and reject together exceed the stock on hand makes `sold`
   * negative — and revenue with it. Nothing caught that: `zeroSales` filters
   * `sold <= 0`, so an impossible row was reported as a product that simply did
   * not sell, and the negative revenue quietly reduced the day's total.
   *
   * Deliberately not applied to the XLSX import, which reproduces a historical
   * sheet as it was actually written. Refusing a whole month's import over one
   * badly-typed row from last year would be the wrong trade; this guards entry,
   * where the person who made the typo is present to fix it.
   */
  private assertRowIsPossible(row: {
    quantity: number;
    delivery: number;
    leftover: number;
    reject: number;
    adjustments?: Array<{ type: string; value: number }>;
  }): void {
    const onHand =
      row.quantity + row.delivery + computeAdjSum(row.adjustments);
    const accountedFor = row.leftover + row.reject;
    if (accountedFor > onHand) {
      throw new BadRequestException(
        `Leftover (${row.leftover}) and reject (${row.reject}) come to ${accountedFor}, ` +
          `but only ${onHand} units existed for this product and day.`,
      );
    }
  }

  async create(body: CreateInventoryDto, userId?: number) {
    const [row] = await this.writeEntries([body], userId);
    return row;
  }

  async createBulk(items: CreateInventoryDto[], userId?: number) {
    return this.writeEntries(items, userId);
  }

  /**
   * Upsert whole-day entries, carry the change forward, and check the result.
   *
   * `@@unique([branchId, productId, date])` does not include `deletedAt`, so a
   * soft-deleted row still occupies the slot and the upsert matches it.
   * Without clearing `deletedAt` the write would succeed and stay invisible to
   * every read, all of which filter `deletedAt: null`. Re-entering a deleted
   * day is a restore.
   *
   * Opening stock is whatever the previous day closed on; a typed `quantity`
   * only stands on a product's very first day (see stock-chain.ts). The
   * "leftover can't exceed stock" check runs on the reconciled rows, inside
   * the transaction, so an impossible entry rolls everything back — the POST
   * path used to skip it entirely.
   */
  private writeEntries(items: CreateInventoryDto[], userId?: number) {
    return this.prisma.$transaction(async (tx) => {
      // Chain locks before any row is written (see stock-chain.ts).
      await lockInventoryChains(tx, items);
      // What each day held before, for the change history.
      const before = await tx.inventory.findMany({
        where: {
          OR: items.map((i) => ({
            branchId: i.branchId,
            productId: i.productId,
            date: toUtcDay(i.date),
          })),
        },
      });
      const beforeByKey = new Map(
        before.map((r) => [`${r.branchId}:${r.productId}:${r.date.toISOString()}`, r]),
      );
      const ids: number[] = [];
      const audit: AuditEntry[] = [];
      const now = new Date();
      for (const item of items) {
        const date = toUtcDay(item.date);
        // Only an entered leftover is a count. A row written without one
        // (the sheet's Initialize, a morning delivery) stays uncounted and
        // sells nothing until someone counts it.
        const counted = item.leftover !== undefined;
        const prior = beforeByKey.get(`${item.branchId}:${item.productId}:${date.toISOString()}`);
        const row = await tx.inventory.upsert({
          where: {
            branchId_productId_date: {
              branchId: item.branchId,
              productId: item.productId,
              date,
            },
          },
          update: {
            quantity: item.quantity,
            delivery: item.delivery,
            leftover: item.leftover,
            reject: item.reject,
            notes: item.notes,
            isAutoGenerated: false,
            ...(counted ? { leftoverCountedAt: now } : {}),
            deletedAt: null,
            updatedById: userId ?? null,
          },
          create: {
            branchId: item.branchId,
            productId: item.productId,
            date,
            quantity: item.quantity,
            delivery: item.delivery,
            leftover: item.leftover,
            reject: item.reject,
            notes: item.notes,
            isAutoGenerated: false,
            leftoverCountedAt: counted ? now : null,
            createdById: userId,
          },
        });
        ids.push(row.id);
        audit.push({
          entity: 'Inventory',
          entityId: row.id,
          before: prior,
          after: row,
          action: !prior ? 'create' : prior.deletedAt ? 'restore' : 'update',
        });
      }

      await recordChanges(tx, audit, userId);
      await this.carryForwardFrom(tx, ids, userId);
      return this.checkAndReturn(tx, ids);
    }, WRITE_TX_OPTIONS);
  }

  /** Reconcile the chains of the given rows, starting at each row's own day. */
  private async carryForwardFrom(
    tx: Prisma.TransactionClient,
    ids: number[],
    userId?: number | null,
  ): Promise<number> {
    const rows = await tx.inventory.findMany({
      where: { id: { in: ids } },
      select: { branchId: true, productId: true, date: true },
    });
    return reconcileInventoryChains(
      tx,
      rows.map((r) => ({ branchId: r.branchId, productId: r.productId, fromDate: r.date })),
      { userId },
    );
  }

  /** Re-read written rows after carry-forward, reject impossible ones, return them. */
  private async checkAndReturn(tx: Prisma.TransactionClient, ids: number[]) {
    const rows = await tx.inventory.findMany({
      where: { id: { in: ids } },
      include: { branch: true, product: true, ...withAdjustments },
    });
    for (const row of rows) this.assertRowIsPossible(row);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => {
      const { adjustments: _adjustments, ...row } = byId.get(id)!;
      return row;
    });
  }

  async findAll(page = 1, limit = 50, branchId?: number) {
    limit = clampPageSize(limit);
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(branchId != null ? { branchId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { branch: true, product: true },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async search(q: string, page = 1, limit = 50, branchId?: number) {
    limit = clampPageSize(limit);
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(branchId != null ? { branchId } : {}),
      OR: [
        { notes: { contains: q, mode: Prisma.QueryMode.insensitive } },
        {
          branch: { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
        },
        {
          product: {
            name: { contains: q, mode: Prisma.QueryMode.insensitive },
          },
        },
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { branch: true, product: true },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByBranch(branchId: number, page = 1, limit = 50) {
    limit = clampPageSize(limit);
    const skip = (page - 1) * limit;
    const where = { branchId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { product: true },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByProduct(
    productId: number,
    page = 1,
    limit = 50,
    branchId?: number,
  ) {
    limit = clampPageSize(limit);
    const skip = (page - 1) * limit;
    const where = {
      productId,
      deletedAt: null,
      ...(branchId != null ? { branchId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: { branch: true },
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * One pass over the rows for every figure the summary and dashboard show.
   * The dashboard used to walk the rows a second time for its daily
   * breakdown, recomputing sold and revenue per row.
   */
  private aggregateInventoryMetrics(
    rows: Array<{
      branchId: number;
      productId: number;
      date: Date;
      quantity: number;
      delivery: number;
      leftover: number;
      reject: number;
      leftoverCountedAt: Date | null;
      adjustments: Array<{ type: string; value: number }>;
      product: {
        type: string;
        price: number | { toNumber(): number };
        name: string;
      };
    }>,
    historyByProduct: PriceHistoryMap,
  ) {
    let totalRevenue = 0;
    let totalSold = 0;
    let totalDelivery = 0;
    let totalLeftover = 0;
    let totalReject = 0;
    let uncountedRows = 0;
    // A product nobody has counted yet has sold 0 so far, which is not the
    // same as not selling: zeroSales only lists products with a count.
    const countedProducts = new Set<number>();
    const revenueByType: Record<string, number> = {
      BREAD: 0,
      CAKE: 0,
      SPECIAL: 0,
      MISCELLANEOUS: 0,
    };
    // Keyed by productId, and the VALUE carries productId too: consumers take
    // .values() and hand the result to the UI, which needs a unique React key.
    // Product names are deliberately not unique (two "Bonette" rows, ₱30 and
    // ₱8), so a name-keyed list drops or duplicates entries.
    const revenueByProduct = new Map<
      number,
      { productId: number; name: string; revenue: number; sold: number }
    >();
    const daily = new Map<
      string,
      { revenue: number; sold: number; delivery: number; leftover: number }
    >();

    // Leftover carries into the next day's opening stock, so summing it over a
    // range counted the same unsold bread once for every day it sat there.
    // Over a range it means what is still on hand at the end: each branch and
    // product's leftover on its last day.
    const lastLeftover = new Map<string, { date: Date; leftover: number }>();

    // Money is added up in whole centavos (sold is whole pieces, a price has
    // 2 dp), so the totals are exact whatever order the rows arrive in.
    for (const inv of rows) {
      const sold = computeSold(inv);
      const revenue = revenueCentavos(sold, inv, historyByProduct);

      totalRevenue += revenue;
      totalSold += sold;
      totalDelivery += inv.delivery;
      totalReject += inv.reject;
      if (inv.leftoverCountedAt === null) uncountedRows++;
      else countedProducts.add(inv.productId);
      const key = `${inv.branchId}:${inv.productId}`;
      const last = lastLeftover.get(key);
      if (!last || inv.date > last.date) {
        lastLeftover.set(key, { date: inv.date, leftover: inv.leftover });
      }

      if (inv.product.type in revenueByType)
        revenueByType[inv.product.type] += revenue;
      const prev = revenueByProduct.get(inv.productId);
      revenueByProduct.set(inv.productId, {
        productId: inv.productId,
        name: inv.product.name,
        revenue: (prev?.revenue ?? 0) + revenue,
        sold: (prev?.sold ?? 0) + sold,
      });

      const dk = inv.date.toISOString().slice(0, 10);
      const d = daily.get(dk) ?? { revenue: 0, sold: 0, delivery: 0, leftover: 0 };
      d.revenue += revenue;
      d.sold += sold;
      d.delivery += inv.delivery;
      d.leftover += inv.leftover;
      daily.set(dk, d);
    }

    for (const { leftover } of lastLeftover.values()) totalLeftover += leftover;

    for (const type of Object.keys(revenueByType)) {
      revenueByType[type] = pesos(revenueByType[type]);
    }
    for (const entry of revenueByProduct.values()) entry.revenue = pesos(entry.revenue);

    const dailyBreakdown = [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v, revenue: pesos(v.revenue) }));

    return {
      totalRevenue: pesos(totalRevenue),
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      uncountedRows,
      revenueByType,
      revenueByProduct,
      countedProducts,
      dailyBreakdown,
    };
  }

  async findByDate(branchId: number, date: string) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        branchId,
        date: toUtcDay(date),
        deletedAt: null,
      },
      orderBy: [
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
      include: {
        product: true,
        adjustments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const historyMap = await loadPriceHistory(this.prisma, [
      ...new Set(rows.map((r) => r.productId)),
    ]);
    return rows.map((r) => ({
      ...r,
      effectivePrice: getEffectivePrice(
        r.productId,
        r.date,
        Number(r.product.price),
        historyMap,
      ),
    }));
  }

  async findByBranchDateRange(
    branchId: number,
    startDate: string,
    endDate?: string,
  ) {
    const start = toUtcDay(startDate);
    const end = endDate ? toUtcDay(endDate) : start;
    assertDateRange(start, end);

    const rows = await this.prisma.inventory.findMany({
      where: {
        branchId,
        date:
          start.getTime() === end.getTime() ? start : { gte: start, lte: end },
        deletedAt: null,
      },
      orderBy: [
        { date: 'asc' },
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
      include: {
        product: true,
        adjustments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const historyMap = await loadPriceHistory(this.prisma, [
      ...new Set(rows.map((r) => r.productId)),
    ]);
    return rows.map((r) => ({
      ...r,
      effectivePrice: getEffectivePrice(
        r.productId,
        r.date,
        Number(r.product.price),
        historyMap,
      ),
    }));
  }

  async findByDateAllBranches(
    startDate?: string,
    endDate?: string,
    branchId?: number,
  ) {
    // No start date means today, not "every row ever": this read includes
    // each row's adjustments and was the heaviest unbounded query in the API.
    const start = startDate ? toUtcDay(startDate) : this.localToday();
    const end = endDate ? toUtcDay(endDate) : start;
    assertDateRange(start, end);
    const dateFilter =
      start.getTime() === end.getTime()
        ? { date: start }
        : { date: { gte: start, lte: end } };
    const rows = await this.prisma.inventory.findMany({
      where: {
        ...dateFilter,
        deletedAt: null,
        ...(branchId != null ? { branchId } : {}),
      },
      orderBy: [
        { branchId: 'asc' },
        { date: 'asc' },
        { product: { type: 'asc' } },
        { product: { sortOrder: 'asc' } },
        { product: { name: 'asc' } },
      ],
      include: {
        branch: true,
        product: true,
        adjustments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    const historyMap = await loadPriceHistory(this.prisma, [
      ...new Set(rows.map((r) => r.productId)),
    ]);
    return rows.map((r) => ({
      ...r,
      effectivePrice: getEffectivePrice(
        r.productId,
        r.date,
        Number(r.product.price),
        historyMap,
      ),
    }));
  }

  async findOne(id: number, branchId?: number) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) },
      include: {
        branch: true,
        product: true,
        adjustments: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }
    return inventory;
  }

  async update(
    id: number,
    body: UpdateInventoryDto,
    branchId?: number,
    userId?: number,
  ) {
    const { rows, cascadeUpdated } = await this.applyEdits(
      [{ id, ...body }],
      branchId,
      userId,
    );
    return { ...rows[0], cascadeWarning: 0, cascadeUpdated };
  }

  /**
   * Apply a whole sheet's worth of edits in one request.
   *
   * The sheet used to send one PATCH per edited row. Two things break at scale:
   * the global 20-requests-per-minute throttle rejects everything past the
   * twentieth row, and `Promise.all` rejects on the first failure, so the user
   * is told the save failed while some rows did land.
   */
  async updateBulk(
    items: UpdateInventoryItemDto[],
    branchId?: number,
    userId?: number,
  ) {
    if (items.length === 0)
      return { updated: 0, cascadeUpdated: 0, cascadeWarnings: [] as CascadeWarning[] };

    const { cascadeUpdated } = await this.applyEdits(items, branchId, userId);
    return {
      updated: items.length,
      cascadeUpdated,
      // Later days now always follow the edited close, so nothing is left
      // derived from an older count.
      cascadeWarnings: [] as CascadeWarning[],
    };
  }

  /**
   * Edit rows, carry every change forward, and validate — all or nothing.
   *
   * Validation runs on the rows as they stand after carry-forward: an edit
   * can change a later day's opening stock, and that is what decides whether
   * the later day's counts are possible.
   */
  private applyEdits(
    items: Array<UpdateInventoryDto & { id: number }>,
    branchId?: number,
    userId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ids = items.map((i) => i.id);
      const existing = await tx.inventory.findMany({
        where: {
          id: { in: ids },
          deletedAt: null,
          ...(branchId != null ? { branchId } : {}),
        },
      });
      // Chain locks before any row is written (see stock-chain.ts).
      await lockInventoryChains(tx, existing);
      const beforeById = new Map(existing.map((r) => [r.id, r]));
      const audit: AuditEntry[] = [];

      // A row missing from a branch-scoped read is one the caller may not touch.
      if (existing.length !== new Set(ids).size) {
        const found = new Set(existing.map((r) => r.id));
        const missing = ids.filter((rowId) => !found.has(rowId));
        if (ids.length === 1) {
          throw new NotFoundException('Inventory record not found');
        }
        throw new NotFoundException(
          `Inventory rows not found or outside your branch: ${missing.join(', ')}`,
        );
      }

      const now = new Date();
      for (const item of items) {
        const after = await tx.inventory.update({
          where: { id: item.id },
          data: {
            // No branch/product/date: the DTO does not carry them, because
            // re-keying a row is not an edit. See UpdateInventoryDto.
            quantity: item.quantity,
            delivery: item.delivery,
            leftover: item.leftover,
            reject: item.reject,
            notes: item.notes,
            // A user-edited row is no longer a placeholder, but it is only
            // counted once its leftover is entered.
            isAutoGenerated: false,
            ...(item.leftover !== undefined ? { leftoverCountedAt: now } : {}),
            updatedById: userId ?? null,
          },
        });
        audit.push({
          entity: 'Inventory',
          entityId: item.id,
          before: beforeById.get(item.id),
          after,
        });
      }

      await recordChanges(tx, audit, userId);
      const cascadeUpdated = await this.carryForwardFrom(tx, ids, userId);
      const rows = await this.checkAndReturn(tx, ids);
      return { rows, cascadeUpdated };
    }, WRITE_TX_OPTIONS);
  }

  async remove(id: number, branchId?: number, userId?: number) {
    const where = { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) };
    const found = await this.prisma.inventory.findFirst({ where, select: { branchId: true, productId: true } });
    if (!found) throw new NotFoundException('Inventory record not found');
    return this.prisma.$transaction(async (tx) => {
      await lockInventoryChains(tx, [found]);
      // Re-read under the lock: the audit's "before" must be what was deleted,
      // not what the row held before a write that landed while we waited.
      const existing = await tx.inventory.findFirst({ where });
      if (!existing) throw new NotFoundException('Inventory record not found');
      const removed = await tx.inventory.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: userId ?? null },
      });
      await recordChanges(
        tx,
        // after: null, so the event shows what was removed (value → null).
        [{ entity: 'Inventory', entityId: id, before: existing, after: null, action: 'delete' }],
        userId,
      );
      // The next day now follows the day before the deleted one.
      await reconcileInventoryChains(
        tx,
        [{ branchId: removed.branchId, productId: removed.productId, fromDate: removed.date }],
        { userId },
      );
      return removed;
    }, WRITE_TX_OPTIONS);
  }

  getSummary(branchId: number | null, startDate?: string, endDate?: string) {
    return this.cache.wrap(
      CACHE_NS.INVENTORY_AGG,
      ['summary', branchId ?? 'all', startDate ?? '', endDate ?? ''],
      () => this.getSummaryUncached(branchId, startDate, endDate),
    );
  }

  private async getSummaryUncached(
    branchId: number | null,
    startDate?: string,
    endDate?: string,
  ) {
    const today = this.localToday();
    const start = startDate ? toUtcDay(startDate) : today;
    const end = endDate ? toUtcDay(endDate) : start;
    assertDateRange(start, end);

    const rows = await this.prisma.inventory.findMany({
      where: {
        deletedAt: null,
        date:
          start.getTime() === end.getTime() ? start : { gte: start, lte: end },
        ...(branchId != null ? { branchId } : {}),
      },
      include: {
        adjustments: { where: { deletedAt: null } },
        product: { select: { id: true, type: true, price: true, name: true } },
      },
    });

    if (rows.length === 0) {
      return {
        totalRevenue: 0,
        totalSold: 0,
        totalDelivery: 0,
        totalLeftover: 0,
        totalReject: 0,
        uncountedRows: 0,
        revenueByType: { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 },
        topProduct: null,
        zeroSales: [] as { productId: number; name: string; revenue: number; sold: number }[],
      };
    }

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const historyByProduct = await loadPriceHistory(this.prisma, productIds);
    const m = this.aggregateInventoryMetrics(rows, historyByProduct);
    return {
      totalRevenue: m.totalRevenue,
      totalSold: m.totalSold,
      totalDelivery: m.totalDelivery,
      totalLeftover: m.totalLeftover,
      totalReject: m.totalReject,
      uncountedRows: m.uncountedRows,
      revenueByType: m.revenueByType,
      ...rankProducts(m.revenueByProduct, m.countedProducts),
    };
  }

  getDashboard(branchId: number | null, startDate?: string, endDate?: string) {
    return this.cache.wrap(
      CACHE_NS.INVENTORY_AGG,
      ['dashboard', branchId ?? 'all', startDate ?? '', endDate ?? ''],
      () => this.getDashboardUncached(branchId, startDate, endDate),
    );
  }

  private async getDashboardUncached(
    branchId: number | null,
    startDate?: string,
    endDate?: string,
  ) {
    const today = this.localToday();
    const start = startDate ? toUtcDay(startDate) : today;
    const end = endDate ? toUtcDay(endDate) : start;
    assertDateRange(start, end);

    const rows = await this.prisma.inventory.findMany({
      where: {
        deletedAt: null,
        date:
          start.getTime() === end.getTime() ? start : { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { date: 'asc' },
      include: {
        adjustments: { where: { deletedAt: null } },
        product: { select: { id: true, type: true, price: true, name: true } },
      },
    });

    const isRange = start.getTime() !== end.getTime();
    const dateRange = {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };

    if (rows.length === 0) {
      return {
        dateRange,
        isRange,
        totalRevenue: 0,
        totalSold: 0,
        totalDelivery: 0,
        totalLeftover: 0,
        totalReject: 0,
        uncountedRows: 0,
        revenueByType: { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 },
        topProduct: null,
        zeroSales: [] as { productId: number; name: string; revenue: number; sold: number }[],
        dailyBreakdown: [] as {
          date: string;
          revenue: number;
          sold: number;
          delivery: number;
          leftover: number;
        }[],
      };
    }

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const historyByProduct = await loadPriceHistory(this.prisma, productIds);
    const m = this.aggregateInventoryMetrics(rows, historyByProduct);
    return {
      dateRange,
      isRange,
      totalRevenue: m.totalRevenue,
      totalSold: m.totalSold,
      totalDelivery: m.totalDelivery,
      totalLeftover: m.totalLeftover,
      totalReject: m.totalReject,
      uncountedRows: m.uncountedRows,
      revenueByType: m.revenueByType,
      ...rankProducts(m.revenueByProduct, m.countedProducts),
      dailyBreakdown: m.dailyBreakdown,
    };
  }

  async exportSalesCsv(
    branchId: number | null,
    startDate?: string,
    endDate?: string,
  ): Promise<string> {
    const data = await this.getDashboard(branchId, startDate, endDate);
    const lines: string[] = [];

    lines.push('Sales Report');
    lines.push(
      `Period,${data.dateRange.startDate} to ${data.dateRange.endDate}`,
    );
    lines.push('');
    lines.push('SUMMARY');
    lines.push(`Total Revenue,${Number(data.totalRevenue).toFixed(2)}`);
    lines.push(`Total Sold,${data.totalSold}`);
    lines.push(`Total Delivered,${data.totalDelivery}`);
    lines.push(`Total Leftover,${data.totalLeftover}`);
    lines.push(`Total Reject,${data.totalReject}`);
    lines.push('');
    lines.push('REVENUE BY PRODUCT TYPE');
    lines.push('Type,Revenue');
    for (const [type, revenue] of Object.entries(data.revenueByType)) {
      lines.push(`${type},${Number(revenue).toFixed(2)}`);
    }
    if (data.topProduct) {
      lines.push('');
      lines.push('TOP PRODUCT');
      lines.push(`Name,Sold,Revenue`);
      lines.push(
        `${csvField(data.topProduct.name)},${data.topProduct.sold},${Number(data.topProduct.revenue).toFixed(2)}`,
      );
    }
    if (data.dailyBreakdown.length > 0) {
      lines.push('');
      lines.push('DAILY BREAKDOWN');
      lines.push('Date,Revenue,Sold,Delivery,Leftover');
      for (const d of data.dailyBreakdown) {
        lines.push(
          `${d.date},${Number(d.revenue).toFixed(2)},${d.sold},${d.delivery},${d.leftover}`,
        );
      }
    }
    if (data.zeroSales.length > 0) {
      lines.push('');
      lines.push('ZERO SALES PRODUCTS');
      lines.push('Product,Sold,Revenue');
      for (const z of data.zeroSales) {
        lines.push(
          `${csvField(z.name)},${z.sold},${Number(z.revenue).toFixed(2)}`,
        );
      }
    }

    return lines.join('\r\n');
  }

  /**
   * Return all branch × product × date combos that have no Inventory entry
   * within the given date range. Limited to 31 days to prevent huge payloads.
   */
  getGaps(branchId: number | null, startDate: string, endDate: string) {
    return this.cache.wrap(
      CACHE_NS.INVENTORY_AGG,
      ['gaps', branchId ?? 'all', startDate, endDate],
      () => this.getGapsUncached(branchId, startDate, endDate),
    );
  }

  private async getGapsUncached(
    branchId: number | null,
    startDate: string,
    endDate: string,
  ) {
    const start = toUtcDay(startDate);
    const end = toUtcDay(endDate);
    assertDateRange(start, end);

    const dates = eachDayInclusive(start, end);

    // Fetch active branches and products
    const [branches, products] = await Promise.all([
      this.prisma.branch.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          ...(branchId ? { id: branchId } : {}),
        },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, date: true },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    // Fetch existing inventory rows in the range
    const existing = await this.prisma.inventory.findMany({
      where: {
        deletedAt: null,
        date: { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      select: { branchId: true, productId: true, date: true },
    });

    // Build a Set of keys for O(1) lookup: "branchId-productId-YYYY-MM-DD"
    const existingKeys = new Set(
      existing.map(
        (r) =>
          `${r.branchId}-${r.productId}-${r.date.toISOString().slice(0, 10)}`,
      ),
    );

    const missing: {
      branchId: number;
      branchName: string;
      productId: number;
      productName: string;
      date: string;
    }[] = [];
    for (const branch of branches) {
      for (const product of products) {
        // A day before the product's launch is not a missing entry.
        const launched = toUtcDay(product.date).getTime();
        for (const date of dates) {
          if (date.getTime() < launched) continue;
          const key = `${branch.id}-${product.id}-${date.toISOString().slice(0, 10)}`;
          if (!existingKeys.has(key)) {
            missing.push({
              branchId: branch.id,
              branchName: branch.name,
              productId: product.id,
              productName: product.name,
              date: date.toISOString().slice(0, 10),
            });
          }
        }
      }
    }

    return { missing, total: missing.length };
  }

  /**
   * Re-derive every later day's opening stock (and placeholder closes) from
   * `fromDate` onwards. Writers already keep the chain current; this walks it
   * in full to repair history written before they did.
   */
  async recascadeLeftovers(
    branchId: number,
    productId: number,
    fromDate: string,
  ) {
    const date = toUtcDay(fromDate);
    const seed = await this.prisma.inventory.findFirst({
      where: { branchId, productId, date, deletedAt: null },
      select: { id: true },
    });
    if (!seed) throw new NotFoundException('Source inventory row not found');

    const updated = await this.prisma.$transaction(
      (tx) =>
        reconcileInventoryChains(
          tx,
          [{ branchId, productId, fromDate: date }],
          { full: true },
        ),
      WRITE_TX_OPTIONS,
    );
    return { updated };
  }

  /**
   * Add a delivery to a branch's row for the day, inside the caller's
   * transaction. Used when a production order is finalized.
   *
   * Adds rather than sets: the branch may already have a delivery recorded
   * (another order, or one typed on the sheet), and overwriting it lost it.
   * Carry-forward then does the rest: a placeholder's close rises with the
   * delivery (nobody has counted, so nothing is assumed sold), a counted day
   * keeps its leftover, and later days open on the new close. A missing row is
   * created as a placeholder, so it opens on the previous day's close.
   */
  async addDeliveryInTx(
    tx: Prisma.TransactionClient,
    key: { branchId: number; productId: number; date: Date },
    quantity: number,
    userId?: number,
  ): Promise<void> {
    if (quantity <= 0) return;
    const { branchId, productId, date } = key;

    await lockInventoryChains(tx, [key]);
    const before = await tx.inventory.findUnique({
      where: { branchId_productId_date: { branchId, productId, date } },
    });
    const after = await tx.inventory.upsert({
      where: { branchId_productId_date: { branchId, productId, date } },
      // A tombstoned slot receiving real stock is restored, as everywhere
      // else the unique key lands on a deleted row.
      update: { delivery: { increment: quantity }, deletedAt: null },
      create: {
        branchId,
        productId,
        date,
        quantity: 0,
        delivery: quantity,
        leftover: quantity,
        isAutoGenerated: true,
        notes: `Auto-initialized by a finalized production order for ${date.toISOString().slice(0, 10)}`,
      },
    });
    await recordChanges(
      tx,
      [{ entity: 'Inventory', entityId: after.id, before, after }],
      userId,
    );
    await reconcileInventoryChains(
      tx,
      [{ branchId, productId, fromDate: date }],
      { userId },
    );
  }

  /**
   * How a row reached its current values: every recorded change, newest
   * first, with who made it. Scoped like the other by-id reads.
   */
  async history(id: number, branchId?: number) {
    const row = await this.prisma.inventory.findFirst({
      where: { id, ...(branchId != null ? { branchId } : {}) },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Inventory record not found');
    return this.prisma.auditEvent.findMany({
      where: { entity: 'Inventory', entityId: id },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, email: true } } },
      take: 200,
    });
  }

  getRejectionByProduct(
    branchId: number | null,
    startDate?: string,
    endDate?: string,
    type?: ProductType,
  ) {
    return this.cache.wrap(
      CACHE_NS.INVENTORY_AGG,
      [
        'rejection',
        branchId ?? 'all',
        startDate ?? '',
        endDate ?? '',
        type ?? 'all',
      ],
      () =>
        this.getRejectionByProductUncached(branchId, startDate, endDate, type),
    );
  }

  private async getRejectionByProductUncached(
    branchId: number | null,
    startDate?: string,
    endDate?: string,
    type?: ProductType,
  ) {
    const today = this.localToday();
    const start = startDate ? toUtcDay(startDate) : today;
    const end = endDate ? toUtcDay(endDate) : start;
    assertDateRange(start, end, MAX_REPORT_RANGE_DAYS);

    // Step 1: resolve qualifying products (excludes soft-deleted products).
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null, ...(type ? { type } : {}) },
      select: { id: true, name: true, type: true },
    });

    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);

    // Step 2: the rows, four integers each. The rate is rejects over what the
    // branch had to reject from — the opening stock on the first day plus
    // every delivery after — not over deliveries alone, which read 0% for a
    // day that only rejected carried-over bread and could exceed 100%.
    // Opening is taken once per branch and product: summing it per day would
    // count the same unsold bread again for every day it carried.
    const rows = await this.prisma.inventory.findMany({
      where: {
        deletedAt: null,
        productId: { in: productIds },
        date:
          start.getTime() === end.getTime() ? start : { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      orderBy: { date: 'asc' },
      select: { branchId: true, productId: true, quantity: true, delivery: true, reject: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const byProduct = new Map<number, { totalDelivery: number; totalReject: number; totalSupply: number }>();
    const seenChain = new Set<string>();
    for (const r of rows) {
      const agg = byProduct.get(r.productId) ?? { totalDelivery: 0, totalReject: 0, totalSupply: 0 };
      const chain = `${r.branchId}:${r.productId}`;
      if (!seenChain.has(chain)) {
        seenChain.add(chain);
        agg.totalSupply += r.quantity;
      }
      agg.totalDelivery += r.delivery;
      agg.totalSupply += r.delivery;
      agg.totalReject += r.reject;
      byProduct.set(r.productId, agg);
    }

    return [...byProduct.entries()]
      .map(([productId, agg]) => {
        const product = productMap.get(productId)!;
        return {
          productId,
          name: product.name,
          type: product.type,
          totalDelivery: agg.totalDelivery,
          totalSupply: agg.totalSupply,
          totalReject: agg.totalReject,
          rejectRate: agg.totalSupply > 0 ? (agg.totalReject / agg.totalSupply) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalReject - a.totalReject);
  }
}

type ProductRevenue = { productId: number; name: string; revenue: number; sold: number };

/** Best seller first; zero sellers are products counted but not sold. */
function rankProducts(byProduct: Map<number, ProductRevenue>, counted: Set<number>) {
  const sorted = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue);
  return {
    topProduct: sorted[0] ?? null,
    zeroSales: sorted.filter((r) => r.sold <= 0 && counted.has(r.productId)),
  };
}
