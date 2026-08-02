import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CronSecretGuard } from '../common/guards/cron-secret.guard';
import { JobsService } from './jobs.service';

/**
 * Scheduler entrypoints for the jobs that used to run on `@nestjs/schedule`.
 *
 * These are separate from JobsController's manual triggers for two reasons:
 * Vercel Cron issues **GET** requests (the manual triggers are POST), and it
 * authenticates with a shared secret rather than a user JWT.
 *
 * The schedules live in vercel.json, which is strict JSON and cannot carry
 * comments — so the mapping is recorded here. **Vercel Cron schedules are
 * always UTC**, while the business rules are Manila (UTC+8):
 *
 *   morning-init  0 22 * * *  UTC  =  6 AM Manila (next day)
 *   nightly       0 15 * * *  UTC  = 11 PM Manila (same day)
 *
 * Note the date rollover on morning-init: 22:00 UTC is already the following
 * calendar day in Manila. The jobs derive their own Manila date internally, so
 * this is correct — but it is easy to "fix" wrongly when reading the cron line
 * alone.
 */
/** Runs a job and reports its outcome instead of aborting the whole request. */
async function settle<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    return { ok: true, result: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

@ApiExcludeController()
@Controller('jobs/cron')
@Public()
@UseGuards(CronSecretGuard)
export class CronController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * 11 PM Manila — the two former 11 PM jobs, run back to back.
   *
   * They are combined into one entrypoint for two reasons: Vercel's Hobby plan
   * allows only two cron jobs per project, and running them sequentially is
   * kinder to the database than the old decorators, which fired both at the
   * same instant against a connection-limited pooler.
   *
   * Each job records its own JobRun row, so combining them here does not blur
   * the audit trail. Material stock runs even if the inventory pass throws —
   * a failure in one should not silently skip the other.
   */
  @Get('nightly')
  async nightly() {
    const inventory = await settle(() =>
      this.jobsService.autofillMissingEntries(undefined, 'cron'),
    );
    const materials = await settle(() =>
      this.jobsService.autofillMaterialStock(undefined, 'cron'),
    );

    return { inventory, materials };
  }

  /** 6 AM Manila — seeds the day's rows before branches start entering data. */
  @Get('morning-init')
  async morningInit() {
    await this.jobsService.autofillMorningInit();
    return { ok: true };
  }
}
