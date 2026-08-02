import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';

export type AutofillScope = 'inventory' | 'materials';

/**
 * Keeps today's placeholder rows filled without a scheduler.
 *
 * The old design had two mechanisms, neither of which survives serverless:
 * `@Cron` decorators (nothing stays alive to fire them) and an `onModuleInit`
 * backfill (which would re-run on *every* cold start, and because `app.init()`
 * awaits it, the first request after any idle period would pay for a full
 * gap scan).
 *
 * Instead the fill is triggered by the pages that need it — the inventory,
 * production, and material-inventory sheets — via AutofillInterceptor. Those
 * are exactly the screens whose rows the job creates, so by the time anyone
 * can notice a missing row, the work has already been done.
 *
 * Three properties make this safe on a hot read path:
 *
 * 1. **Cheap when there is nothing to do.** One indexed `findFirst` on the
 *    date column, then a per-instance memo suppresses even that for a while.
 * 2. **Deduplicated.** Concurrent requests on one instance share a single
 *    in-flight promise. Across instances a duplicate run is possible but
 *    harmless: the underlying jobs are idempotent (`createMany` with
 *    `skipDuplicates`, upserts with empty `update`).
 * 3. **Never fatal.** A failure is logged and swallowed. A sheet that renders
 *    without freshly-created placeholders is a far better outcome than a sheet
 *    that 500s.
 */
@Injectable()
export class AutofillOnDemandService {
  private readonly logger = new Logger(AutofillOnDemandService.name);

  /** scope → expiry timestamp; suppresses re-checking a scope known to be current. */
  private readonly confirmedUntil = new Map<AutofillScope, number>();

  /** scope → run in progress, so simultaneous requests await one fill. */
  private readonly inFlight = new Map<AutofillScope, Promise<void>>();

  /**
   * How long a "nothing to do" answer is trusted. Long enough that a burst of
   * page loads costs one query, short enough that a product or material added
   * mid-morning gets its rows without waiting for tomorrow. The 11 PM cron
   * used to be what caught those late additions.
   */
  private static readonly CONFIRM_TTL_MS = 5 * 60 * 1000;

  /**
   * Upper bound on catch-up work, in days.
   *
   * The underlying range jobs cap at 365 days, which cannot finish inside a
   * 60s function. A gap wider than this is a real outage, not routine
   * carry-over, and belongs in a deliberate MANAGER-triggered run via
   * `POST /jobs/autofill-range` rather than on a customer's page load.
   */
  private static readonly MAX_CATCHUP_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  /** Ensures today's rows exist for `scope`. Never throws. */
  async ensure(scope: AutofillScope): Promise<void> {
    const existing = this.inFlight.get(scope);
    if (existing) return existing;

    const until = this.confirmedUntil.get(scope);
    if (until !== undefined && until > Date.now()) return;

    const run = this.runOnce(scope).finally(() => this.inFlight.delete(scope));
    this.inFlight.set(scope, run);
    return run;
  }

  private async runOnce(scope: AutofillScope): Promise<void> {
    try {
      const today = manilaToday();
      const lastFilled = await this.lastFilledDate(scope);

      // Already current — the overwhelmingly common case.
      if (lastFilled !== null && lastFilled >= today) {
        this.confirmedUntil.set(
          scope,
          Date.now() + AutofillOnDemandService.CONFIRM_TTL_MS,
        );
        return;
      }

      const start = this.catchUpStart(scope, lastFilled, today);
      await this.fill(scope, start, today);

      this.confirmedUntil.set(
        scope,
        Date.now() + AutofillOnDemandService.CONFIRM_TTL_MS,
      );
    } catch (err) {
      // Deliberately not rethrown: this runs on a read path, and a failed
      // autofill must not turn a working page into a 500. It is visible as a
      // FAILED JobRun row and in the logs.
      this.logger.error(`On-demand autofill failed for ${scope}`, err);
    }
  }

  /** Most recent date that already has rows, as YYYY-MM-DD, or null if none. */
  private async lastFilledDate(scope: AutofillScope): Promise<string | null> {
    const row =
      scope === 'inventory'
        ? await this.prisma.inventory.findFirst({
            orderBy: { date: 'desc' },
            select: { date: true },
          })
        : await this.prisma.materialInventory.findFirst({
            orderBy: { date: 'desc' },
            select: { date: true },
          });

    return row ? row.date.toISOString().slice(0, 10) : null;
  }

  /**
   * First date to fill: the day after the last filled one, clamped so a long
   * outage cannot turn one page load into a year of catch-up.
   */
  private catchUpStart(
    scope: AutofillScope,
    lastFilled: string | null,
    today: string,
  ): string {
    if (lastFilled === null) return today;

    const dayAfter = addDays(lastFilled, 1);
    const earliestAllowed = addDays(today, -AutofillOnDemandService.MAX_CATCHUP_DAYS);

    if (dayAfter < earliestAllowed) {
      this.logger.warn(
        `${scope} gap from ${dayAfter} to ${today} exceeds ` +
          `${AutofillOnDemandService.MAX_CATCHUP_DAYS} days; filling only from ` +
          `${earliestAllowed}. Run POST /jobs/autofill-range for the full period.`,
      );
      return earliestAllowed;
    }
    return dayAfter;
  }

  private async fill(
    target: AutofillScope,
    start: string,
    today: string,
  ): Promise<void> {
    const isSingleDay = start === today;

    if (target === 'inventory') {
      if (isSingleDay) {
        await this.jobs.autofillMissingEntries(today, 'auto');
      } else {
        await this.jobs.autofillDateRange(start, today, 'auto');
      }
      return;
    }

    if (isSingleDay) {
      await this.jobs.autofillMaterialStock(today, 'auto');
    } else {
      await this.jobs.autofillMaterialStockRange(start, today, 'auto');
    }
  }
}

/** Today's date in Manila as YYYY-MM-DD — the boundary every job uses. */
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date(),
  );
}

function addDays(dateStr: string, days: number): string {
  const ts = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  return new Date(ts + days * 86_400_000).toISOString().slice(0, 10);
}
