import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getEffectivePrice } from '../common/utils/price-history.util';
import {
  computeAdjSum,
  computeSold,
} from '../common/utils/inventory-metrics.util';
import { csvField } from '../common/utils/csv.util';
import {
  lockInventoryChains,
  reconcileInventoryChains,
} from '../common/utils/stock-chain';
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
      const ids: number[] = [];
      for (const item of items) {
        const date = toUtcDay(item.date);
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
            createdById: userId,
          },
          select: { id: true, branchId: true, productId: true, date: true },
        });
        ids.push(row.id);
      }

      await this.carryForwardFrom(tx, ids);
      return this.checkAndReturn(tx, ids);
    }, WRITE_TX_OPTIONS);
  }

  /** Reconcile the chains of the given rows, starting at each row's own day. */
  private async carryForwardFrom(
    tx: Prisma.TransactionClient,
    ids: number[],
  ): Promise<number> {
    const rows = await tx.inventory.findMany({
      where: { id: { in: ids } },
      select: { branchId: true, productId: true, date: true },
    });
    return reconcileInventoryChains(
      tx,
      rows.map((r) => ({ branchId: r.branchId, productId: r.productId, fromDate: r.date })),
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

  private aggregateInventoryMetrics(
    rows: Array<{
      branchId: number;
      productId: number;
      date: Date;
      quantity: number;
      delivery: number;
      leftover: number;
      reject: number;
      adjustments: Array<{ type: string; value: number }>;
      product: {
        type: string;
        price: number | { toNumber(): number };
        name: string;
      };
    }>,
    historyByProduct: Map<number, Array<{ effectiveAt: Date; price: number }>>,
  ): {
    totalRevenue: number;
    totalSold: number;
    totalDelivery: number;
    totalLeftover: number;
    totalReject: number;
    revenueByType: Record<string, number>;
    revenueByProduct: Map<
      number,
      { productId: number; name: string; revenue: number; sold: number }
    >;
  } {
    let totalRevenue = 0;
    let totalSold = 0;
    let totalDelivery = 0;
    let totalLeftover = 0;
    let totalReject = 0;
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

    // Leftover carries into the next day's opening stock, so summing it over a
    // range counted the same unsold bread once for every day it sat there.
    // Over a range it means what is still on hand at the end: each branch and
    // product's leftover on its last day.
    const lastLeftover = new Map<string, { date: Date; leftover: number }>();

    for (const inv of rows) {
      const sold = computeSold(inv);
      const effectivePrice = getEffectivePrice(
        inv.productId,
        inv.date,
        Number(inv.product.price),
        historyByProduct,
      );
      const revenue = sold * effectivePrice;

      totalRevenue += revenue;
      totalSold += sold;
      totalDelivery += inv.delivery;
      totalReject += inv.reject;
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
    }

    for (const { leftover } of lastLeftover.values()) totalLeftover += leftover;

    return {
      totalRevenue,
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      revenueByType,
      revenueByProduct,
    };
  }

  private async fetchHistoryMap(
    productIds: number[],
  ): Promise<Map<number, { price: number; effectiveAt: Date }[]>> {
    if (productIds.length === 0) return new Map();
    const histories = await this.prisma.productPriceHistory.findMany({
      where: { productId: { in: productIds } },
      // id breaks ties: two prices set on one day share an effectiveAt,
      // and the one entered later must win.
      orderBy: [{ effectiveAt: 'asc' }, { id: 'asc' }],
    });
    const map = new Map<number, { price: number; effectiveAt: Date }[]>();
    for (const h of histories) {
      const arr = map.get(h.productId) ?? [];
      arr.push({ price: h.price.toNumber(), effectiveAt: h.effectiveAt });
      map.set(h.productId, arr);
    }
    return map;
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
    const historyMap = await this.fetchHistoryMap([
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
    const historyMap = await this.fetchHistoryMap([
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
    const start = startDate ? toUtcDay(startDate) : undefined;
    const end = endDate ? toUtcDay(endDate) : start;
    if (start && end) assertDateRange(start, end);
    const dateFilter = start
      ? start.getTime() === end?.getTime()
        ? { date: start }
        : { date: { gte: start, lte: end } }
      : {};
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
    const historyMap = await this.fetchHistoryMap([
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
        select: { id: true, branchId: true, productId: true },
      });
      // Chain locks before any row is written (see stock-chain.ts).
      await lockInventoryChains(tx, existing);

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

      for (const item of items) {
        await tx.inventory.update({
          where: { id: item.id },
          data: {
            // No branch/product/date: the DTO does not carry them, because
            // re-keying a row is not an edit. See UpdateInventoryDto.
            quantity: item.quantity,
            delivery: item.delivery,
            leftover: item.leftover,
            reject: item.reject,
            notes: item.notes,
            // A user-edited row is no longer a placeholder.
            isAutoGenerated: false,
            updatedById: userId ?? null,
          },
        });
      }

      const cascadeUpdated = await this.carryForwardFrom(tx, ids);
      const rows = await this.checkAndReturn(tx, ids);
      return { rows, cascadeUpdated };
    }, WRITE_TX_OPTIONS);
  }

  async remove(id: number, branchId?: number) {
    const existing = await this.prisma.inventory.findFirst({
      where: { id, deletedAt: null, ...(branchId != null ? { branchId } : {}) },
    });
    if (!existing) throw new NotFoundException('Inventory record not found');
    return this.prisma.$transaction(async (tx) => {
      await lockInventoryChains(tx, [existing]);
      const removed = await tx.inventory.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      // The next day now follows the day before the deleted one.
      await reconcileInventoryChains(tx, [
        { branchId: removed.branchId, productId: removed.productId, fromDate: removed.date },
      ]);
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
        revenueByType: { BREAD: 0, CAKE: 0, SPECIAL: 0, MISCELLANEOUS: 0 },
        topProduct: null,
        zeroSales: [] as { productId: number; name: string; revenue: number; sold: number }[],
      };
    }

    const productIds = [...new Set(rows.map((r) => r.productId))];
    const historyByProduct = await this.fetchHistoryMap(productIds);
    const {
      totalRevenue,
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      revenueByType,
      revenueByProduct,
    } = this.aggregateInventoryMetrics(rows, historyByProduct);

    const sorted = Array.from(revenueByProduct.values()).sort(
      (a, b) => b.revenue - a.revenue,
    );

    return {
      totalRevenue,
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      revenueByType,
      topProduct: sorted[0] ?? null,
      zeroSales: sorted.filter((r) => r.sold <= 0),
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
    const historyByProduct = await this.fetchHistoryMap(productIds);
    const {
      totalRevenue,
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      revenueByType,
      revenueByProduct,
    } = this.aggregateInventoryMetrics(rows, historyByProduct);

    // Daily breakdown (dashboard-only) — single additional pass
    const dailyMap = new Map<
      string,
      { revenue: number; sold: number; delivery: number; leftover: number }
    >();
    for (const inv of rows) {
      const sold = computeSold(inv);
      const effectivePrice = getEffectivePrice(
        inv.productId,
        inv.date,
        Number(inv.product.price),
        historyByProduct,
      );
      const revenue = sold * effectivePrice;
      const dk = inv.date.toISOString().slice(0, 10);
      const day = dailyMap.get(dk) ?? {
        revenue: 0,
        sold: 0,
        delivery: 0,
        leftover: 0,
      };
      dailyMap.set(dk, {
        revenue: day.revenue + revenue,
        sold: day.sold + sold,
        delivery: day.delivery + inv.delivery,
        leftover: day.leftover + inv.leftover,
      });
    }

    const sorted = Array.from(revenueByProduct.values()).sort(
      (a, b) => b.revenue - a.revenue,
    );
    const dailyBreakdown = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return {
      dateRange,
      isRange,
      totalRevenue,
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      revenueByType,
      topProduct: sorted[0] ?? null,
      zeroSales: sorted.filter((r) => r.sold <= 0),
      dailyBreakdown,
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
        select: { id: true, name: true },
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
        for (const date of dates) {
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
  ): Promise<void> {
    if (quantity <= 0) return;
    const { branchId, productId, date } = key;

    await lockInventoryChains(tx, [key]);
    await tx.inventory.upsert({
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
    await reconcileInventoryChains(tx, [{ branchId, productId, fromDate: date }]);
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

    // Step 2: aggregate in the database rather than in application memory.
    const grouped = await this.prisma.inventory.groupBy({
      by: ['productId'],
      where: {
        deletedAt: null,
        productId: { in: productIds },
        date:
          start.getTime() === end.getTime() ? start : { gte: start, lte: end },
        ...(branchId ? { branchId } : {}),
      },
      _sum: { delivery: true, reject: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return grouped
      .map((row) => {
        const product = productMap.get(row.productId)!;
        const totalDelivery = row._sum.delivery ?? 0;
        const totalReject = row._sum.reject ?? 0;
        return {
          productId: row.productId,
          name: product.name,
          type: product.type,
          totalDelivery,
          totalReject,
          rejectRate:
            totalDelivery > 0 ? (totalReject / totalDelivery) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalReject - a.totalReject);
  }
}
