import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialInventoryService } from '../material-inventory/material-inventory.service';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materialInventoryService: MaterialInventoryService,
  ) {}

  /**
   * Wraps a job entry point in a JobRun log row: RUNNING on start, COMPLETED
   * with the result JSON on success, FAILED with the error message on throw
   * (the error is rethrown so manual API callers still see the failure).
   * Log writes are best-effort — a logging failure never blocks the job.
   */
  private async recordRun<T>(
    jobName: string,
    trigger: 'cron' | 'manual' | 'boot',
    targetDate: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    let runId: number | null = null;
    try {
      const run = await this.prisma.jobRun.create({
        data: {
          jobName,
          trigger,
          targetDate: targetDate
            ? new Date(`${targetDate}T00:00:00.000Z`)
            : null,
        },
      });
      runId = run.id;
    } catch (err) {
      this.logger.error(`JobRun create failed for ${jobName}`, err);
    }

    try {
      const result = await fn();
      if (runId != null) {
        await this.prisma.jobRun
          .update({
            where: { id: runId },
            data: {
              status: JobStatus.COMPLETED,
              finishedAt: new Date(),
              result: result as Prisma.InputJsonValue,
            },
          })
          .catch((err) =>
            this.logger.error(`JobRun update failed for ${jobName}`, err),
          );
      }
      return result;
    } catch (err) {
      if (runId != null) {
        await this.prisma.jobRun
          .update({
            where: { id: runId },
            data: {
              status: JobStatus.FAILED,
              finishedAt: new Date(),
              error: err instanceof Error ? err.message : String(err),
            },
          })
          .catch((e) =>
            this.logger.error(`JobRun update failed for ${jobName}`, e),
          );
      }
      throw err;
    }
  }

  /**
   * On server startup, detect any gap since the last filled date and backfill
   * both Inventory/Production rows and MaterialInventory stock cards.
   * This covers the scenario where the server (or cron) was down for N days.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.recordRun('boot-backfill', 'boot', undefined, () =>
        this.runBackfillGaps(),
      );
    } catch (err) {
      // Never block startup on a failed backfill — it is logged and visible
      // as a FAILED JobRun row.
      this.logger.error('Boot backfill failed', err);
    }
  }

  /**
   * Finds the last date that has inventory records and backfills everything
   * from (lastDate + 1) through today. Safe to call repeatedly — upserts
   * with `update: {}` won't overwrite rows that already have real data.
   */
  private async runBackfillGaps(): Promise<{
    inventory: unknown;
    materials: unknown;
  }> {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
    }).format(new Date());

    const [lastInv, lastMat] = await Promise.all([
      this.prisma.inventory.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      this.prisma.materialInventory.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    const invGapStart = lastInv
      ? new Date(lastInv.date.getTime() + 86_400_000).toISOString().slice(0, 10)
      : todayStr;
    const matGapStart = lastMat
      ? new Date(lastMat.date.getTime() + 86_400_000).toISOString().slice(0, 10)
      : todayStr;

    // Nothing to backfill if last record is already today
    const invNeedsBackfill = invGapStart <= todayStr;
    const matNeedsBackfill = matGapStart <= todayStr;

    if (!invNeedsBackfill && !matNeedsBackfill)
      return { inventory: null, materials: null };

    this.logger.log(
      `Startup gap-fill: inv from ${invGapStart}, mat from ${matGapStart} → ${todayStr}`,
    );

    const [inventory, materials] = await Promise.all([
      invNeedsBackfill
        ? this.runAutofillDateRange(invGapStart, todayStr)
        : Promise.resolve(null),
      matNeedsBackfill
        ? this.runAutofillMaterialStockRange(matGapStart, todayStr)
        : Promise.resolve(null),
    ]);
    return { inventory, materials };
  }

  /**
   * Runs every day at 11 PM.
   * For each active branch × active product pair, creates a placeholder
   * Inventory entry (and Production entry) if none exists for the target date.
   * The Inventory placeholder carries forward the leftover from the most recent
   * prior entry (or 0 if no prior entry exists).
   *
   * @param targetDate - Optional YYYY-MM-DD string. Defaults to today (Manila local date).
   * @param trigger    - 'cron' when called by the scheduler, 'manual' from the API.
   * @returns Stats object summarising how many entries were created.
   */
  // Scheduled by Vercel Cron at 11 PM Manila via POST /api/v1/jobs/autofill.
  // See vercel.json — there is no in-process scheduler on serverless.
  async autofillMissingEntries(
    targetDate?: string,
    trigger: 'cron' | 'manual' = 'cron',
  ): Promise<{
    inventoryCreated: number;
    productionCreated: number;
    date: string;
  }> {
    const dateStr =
      targetDate ??
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
        new Date(),
      );

    return this.recordRun('inventory-autofill', trigger, dateStr, async () => {
      this.logger.log(`Auto-fill running for date: ${dateStr}`);

      const [branches, products] = await Promise.all([
        this.prisma.branch.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true },
        }),
        this.prisma.product.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, name: true },
          orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        }),
      ]);

      return this.autofillForDate(dateStr, branches, products);
    });
  }

  private async autofillForDate(
    dateStr: string,
    branches: Array<{ id: number; name: string }>,
    products: Array<{ id: number; name: string }>,
  ): Promise<{
    inventoryCreated: number;
    productionCreated: number;
    date: string;
  }> {
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    const [existingInventory, existingProduction] = await Promise.all([
      this.prisma.inventory.findMany({
        where: { date },
        select: { branchId: true, productId: true },
      }),
      this.prisma.production.findMany({
        where: { date },
        select: { branchId: true, productId: true },
      }),
    ]);

    const existingInvKeys = new Set(
      existingInventory.map((r) => `${r.branchId}-${r.productId}`),
    );
    const existingProdKeys = new Set(
      existingProduction.map((r) => `${r.branchId}-${r.productId}`),
    );

    const { missingInvPairs, missingProdPairs } = this.findMissingPairs(
      branches,
      products,
      existingInvKeys,
      existingProdKeys,
    );
    const priorLeftoverMap = await this.fetchPriorLeftovers(
      missingInvPairs,
      date,
    );

    // One batched INSERT ... ON CONFLICT DO NOTHING per table instead of one
    // upsert per branch × product pair. With a cross-region database, per-pair
    // statements took ~300ms each (~5 min for 3 branches × 165 products) and
    // concurrent runs hit the 2-minute statement timeout waiting on row locks.
    let inventoryCreated = 0;
    let productionCreated = 0;
    if (missingInvPairs.length > 0 || missingProdPairs.length > 0) {
      const [invResult, prodResult] = await this.prisma.$transaction([
        this.prisma.inventory.createMany({
          data: this.buildInventoryRows(
            missingInvPairs,
            priorLeftoverMap,
            date,
            dateStr,
          ),
          skipDuplicates: true,
        }),
        this.prisma.production.createMany({
          data: this.buildProductionRows(missingProdPairs, date, dateStr),
          skipDuplicates: true,
        }),
      ]);
      inventoryCreated = invResult.count;
      productionCreated = prodResult.count;
    }

    this.logger.log(
      `Auto-fill complete for ${dateStr}: ${inventoryCreated} inventory, ${productionCreated} production entries created.`,
    );

    return { inventoryCreated, productionCreated, date: dateStr };
  }

  private findMissingPairs(
    branches: Array<{ id: number }>,
    products: Array<{ id: number }>,
    existingInvKeys: Set<string>,
    existingProdKeys: Set<string>,
  ): {
    missingInvPairs: Array<{ branchId: number; productId: number }>;
    missingProdPairs: Array<{ branchId: number; productId: number }>;
  } {
    const missingInvPairs: Array<{ branchId: number; productId: number }> = [];
    const missingProdPairs: Array<{ branchId: number; productId: number }> = [];
    for (const branch of branches) {
      for (const product of products) {
        const key = `${branch.id}-${product.id}`;
        if (!existingInvKeys.has(key))
          missingInvPairs.push({ branchId: branch.id, productId: product.id });
        if (!existingProdKeys.has(key))
          missingProdPairs.push({ branchId: branch.id, productId: product.id });
      }
    }
    return { missingInvPairs, missingProdPairs };
  }

  private async fetchPriorLeftovers(
    missingInvPairs: Array<{ branchId: number; productId: number }>,
    date: Date,
  ): Promise<Map<string, number>> {
    const priorLeftoverMap = new Map<string, number>();
    if (missingInvPairs.length === 0) return priorLeftoverMap;

    const branchIds = [...new Set(missingInvPairs.map((p) => p.branchId))];
    const productIds = [...new Set(missingInvPairs.map((p) => p.productId))];
    // DISTINCT ON keeps only the newest prior row per pair server-side; the
    // previous findMany shipped the pairs' entire history (grows ~500 rows/day)
    // to the app just to keep the first hit per pair.
    const priorEntries = await this.prisma.$queryRaw<
      Array<{ branchId: number; productId: number; leftover: number }>
    >`
      SELECT DISTINCT ON ("branchId", "productId")
             "branchId", "productId", "leftover"
      FROM "Inventory"
      WHERE "branchId" IN (${Prisma.join(branchIds)})
        AND "productId" IN (${Prisma.join(productIds)})
        AND "date" < ${date}
      ORDER BY "branchId", "productId", "date" DESC
    `;
    for (const entry of priorEntries) {
      priorLeftoverMap.set(
        `${entry.branchId}-${entry.productId}`,
        entry.leftover,
      );
    }
    return priorLeftoverMap;
  }

  private buildInventoryRows(
    pairs: Array<{ branchId: number; productId: number }>,
    priorLeftoverMap: Map<string, number>,
    date: Date,
    dateStr: string,
  ): Prisma.InventoryCreateManyInput[] {
    return pairs.map(({ branchId, productId }) => {
      const prevLeftover =
        priorLeftoverMap.get(`${branchId}-${productId}`) ?? 0;
      return {
        branchId,
        productId,
        date,
        quantity: prevLeftover,
        delivery: 0,
        leftover: prevLeftover,
        reject: 0,
        isAutoGenerated: true,
        notes: `Auto-generated: no inventory entry for ${dateStr}`,
      };
    });
  }

  private buildProductionRows(
    pairs: Array<{ branchId: number; productId: number }>,
    date: Date,
    dateStr: string,
  ): Prisma.ProductionCreateManyInput[] {
    return pairs.map(({ branchId, productId }) => ({
      branchId,
      productId,
      date,
      yield: 0,
      isAutoGenerated: true,
      notes: `Auto-generated placeholder for ${dateStr}`,
    }));
  }

  /**
   * Runs every day at 6 AM Manila time — seeds today's Inventory and Production
   * placeholders early so staff can start creating production orders and editing
   * inventory without waiting for the 11 PM run.
   *
   * The 11 PM cron still runs as a gap-fill pass to catch any products or
   * branches added during the day.
   */
  // Scheduled by Vercel Cron at 6 AM Manila via POST /api/v1/jobs/morning-init.
  async autofillMorningInit(): Promise<void> {
    const manilaDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
    }).format(new Date());
    await this.recordRun('morning-init', 'cron', manilaDate, async () => {
      this.logger.log(
        `Morning auto-fill triggered for Manila date: ${manilaDate}`,
      );
      // Use gap-aware backfill so that if the cron (or server) was down for
      // several days, all missed dates are filled before today is processed.
      return this.runBackfillGaps();
    });
  }

  /**
   * Back-fills all missing entries for every day in [startDate, endDate].
   * Dates are processed in ascending chronological order so each day's
   * inventory correctly inherits the prior day's leftover.
   *
   * @param startDate - YYYY-MM-DD (inclusive)
   * @param endDate   - YYYY-MM-DD (inclusive), defaults to yesterday
   * @param trigger   - 'cron' | 'manual' | 'boot'
   */
  async autofillDateRange(
    startDate: string,
    endDate?: string,
    trigger: 'cron' | 'manual' | 'boot' = 'manual',
  ): Promise<{
    totalInventoryCreated: number;
    totalProductionCreated: number;
    datesProcessed: number;
  }> {
    return this.recordRun('inventory-autofill-range', trigger, startDate, () =>
      this.runAutofillDateRange(startDate, endDate),
    );
  }

  private async runAutofillDateRange(
    startDate: string,
    endDate?: string,
  ): Promise<{
    totalInventoryCreated: number;
    totalProductionCreated: number;
    datesProcessed: number;
  }> {
    // Default endDate to yesterday (UTC).
    const yesterdayStr = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const endStr = endDate ?? yesterdayStr;

    const startTs = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const endTs = new Date(`${endStr}T00:00:00.000Z`).getTime();

    if (startTs > endTs) {
      return {
        totalInventoryCreated: 0,
        totalProductionCreated: 0,
        datesProcessed: 0,
      };
    }

    // Cap to 365 days to avoid runaway backfills.
    const MS_PER_DAY = 86_400_000;
    const diffDays = Math.round((endTs - startTs) / MS_PER_DAY);
    const cappedEndTs = diffDays > 365 ? startTs + 365 * MS_PER_DAY : endTs;
    const cappedEndStr = new Date(cappedEndTs).toISOString().slice(0, 10);

    this.logger.log(
      `Backfill range: ${startDate} → ${cappedEndStr} (${Math.min(diffDays, 365) + 1} days)`,
    );

    let totalInventoryCreated = 0;
    let totalProductionCreated = 0;
    let datesProcessed = 0;

    // Hoist static data: branches and products don't change between iterations
    const [branches, products] = await Promise.all([
      this.prisma.branch.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    let cursorTs = startTs;
    while (cursorTs <= cappedEndTs) {
      const cursorStr = new Date(cursorTs).toISOString().slice(0, 10);
      const result = await this.autofillForDate(cursorStr, branches, products);
      totalInventoryCreated += result.inventoryCreated;
      totalProductionCreated += result.productionCreated;
      datesProcessed++;
      cursorTs += MS_PER_DAY;
    }

    this.logger.log(
      `Backfill complete: ${totalInventoryCreated} inventory + ${totalProductionCreated} production entries across ${datesProcessed} days.`,
    );

    return { totalInventoryCreated, totalProductionCreated, datesProcessed };
  }

  /**
   * Runs every day at 11 PM (alongside the inventory fill).
   * Creates a stock card for every active material that has no entry for the
   * target date, seeding quantity from the previous day's closing stock
   * (quantity + delivery - used).
   *
   * @param targetDate - Optional YYYY-MM-DD string. Defaults to today.
   * @param trigger    - 'cron' when called by the scheduler, 'manual' from the API.
   */
  // Scheduled by Vercel Cron at 11 PM Manila via
  // POST /api/v1/jobs/autofill-material-stock.
  async autofillMaterialStock(
    targetDate?: string,
    trigger: 'cron' | 'manual' = 'cron',
  ): Promise<{ created: number; date: string }> {
    const dateStr = targetDate ?? new Date().toISOString().slice(0, 10);

    return this.recordRun('material-autofill', trigger, dateStr, async () => {
      this.logger.log(`Material stock auto-fill running for date: ${dateStr}`);

      const result = await this.materialInventoryService.initDate(dateStr);

      this.logger.log(
        `Material stock auto-fill complete for ${dateStr}: ${result.created} stock card(s) created.`,
      );

      return { created: result.created, date: dateStr };
    });
  }

  /** Recent job runs (newest first) plus the latest run per job name. */
  async getRuns(jobName?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const [runs, latest] = await Promise.all([
      this.prisma.jobRun.findMany({
        ...(jobName ? { where: { jobName } } : {}),
        orderBy: { startedAt: 'desc' },
        take,
      }),
      this.prisma.jobRun.findMany({
        distinct: ['jobName'],
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    return { runs, latest };
  }

  /**
   * Back-fills missing material stock cards for every day in [startDate, endDate].
   * Processes dates in ascending order so carry-over chaining is correct.
   */
  async autofillMaterialStockRange(
    startDate: string,
    endDate?: string,
    trigger: 'cron' | 'manual' | 'boot' = 'manual',
  ): Promise<{ totalCreated: number; datesProcessed: number }> {
    return this.recordRun('material-autofill-range', trigger, startDate, () =>
      this.runAutofillMaterialStockRange(startDate, endDate),
    );
  }

  private async runAutofillMaterialStockRange(
    startDate: string,
    endDate?: string,
  ): Promise<{ totalCreated: number; datesProcessed: number }> {
    const yesterdayStr = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const endStr = endDate ?? yesterdayStr;

    const startTs = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const endTs = new Date(`${endStr}T00:00:00.000Z`).getTime();

    if (startTs > endTs) {
      return { totalCreated: 0, datesProcessed: 0 };
    }

    const MS_PER_DAY = 86_400_000;
    const diffDays = Math.round((endTs - startTs) / MS_PER_DAY);
    const cappedEndTs = diffDays > 365 ? startTs + 365 * MS_PER_DAY : endTs;
    const cappedEndStr = new Date(cappedEndTs).toISOString().slice(0, 10);

    this.logger.log(
      `Material stock backfill: ${startDate} → ${cappedEndStr} (${Math.min(diffDays, 365) + 1} days)`,
    );

    // Hoist materials fetch outside the loop — active materials don't change between iterations
    const materials = await this.prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    let totalCreated = 0;
    let datesProcessed = 0;
    let cursorTs = startTs;

    while (cursorTs <= cappedEndTs) {
      const cursorStr = new Date(cursorTs).toISOString().slice(0, 10);
      const result = await this.materialInventoryService.initDate(
        cursorStr,
        undefined,
        materials,
      );
      totalCreated += result.created;
      datesProcessed++;
      cursorTs += MS_PER_DAY;
    }

    this.logger.log(
      `Material stock backfill complete: ${totalCreated} stock card(s) across ${datesProcessed} days.`,
    );

    return { totalCreated, datesProcessed };
  }
}
