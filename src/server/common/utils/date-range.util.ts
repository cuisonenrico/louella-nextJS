import { BadRequestException } from '@nestjs/common';

const MS_PER_DAY = 86_400_000;

/**
 * The standard window for any endpoint that scans a date range.
 *
 * This was previously reimplemented in four places with three different
 * spellings of the same 31-day limit (`>= 31`, `> 30`, and a message that said
 * 31 while the check said 30) and two different error types — two of them threw
 * a bare `Error`, which the exception filter renders as a 500, so a user asking
 * for too wide a range was told the server had failed.
 */
export const MAX_RANGE_DAYS = 31;

/**
 * The wider window reports may opt into. Rejection analysis reads only two
 * summed columns per row, so a quarter's worth of days is affordable where a
 * full row-and-adjustment scan is not.
 */
export const MAX_REPORT_RANGE_DAYS = 90;

/**
 * Throws unless [start, end] is a sane, bounded window.
 *
 * `maxDays` counts calendar days inclusive: 31 admits a start date plus the
 * following 30 days.
 */
export function assertDateRange(
  start: Date,
  end: Date,
  maxDays: number = MAX_RANGE_DAYS,
): void {
  const diffDays = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY);
  if (diffDays < 0) {
    throw new BadRequestException('endDate must be on or after startDate');
  }
  if (diffDays >= maxDays) {
    throw new BadRequestException(`Date range cannot exceed ${maxDays} days`);
  }
}

/**
 * Every UTC day from `start` to `end`, both included.
 *
 * Steps by milliseconds rather than `setDate`, which reads the *local* calendar
 * and would land on the wrong instant for a process outside UTC. Vercel always
 * runs UTC, but nothing in the type system says so, and this repo has already
 * been bitten once by assuming the process zone.
 */
export function eachDayInclusive(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let ts = start.getTime(); ts <= end.getTime(); ts += MS_PER_DAY) {
    days.push(new Date(ts));
  }
  return days;
}

/** Matches a bare calendar date with no time or zone attached. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const MANILA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
});

/**
 * Normalise a date input to the UTC-midnight instant standing for its day.
 *
 * Two problems this solves, both of which came from `@IsDateString()` — which
 * accepts a full ISO datetime — feeding a bare `new Date(...)`:
 *
 *   - `Inventory.date` is `@db.Date`, so Postgres truncated the time on write
 *     but the equality filters built from the same string did not, and a query
 *     for `2026-09-08T10:00:00Z` matched nothing.
 *   - `MaterialInventory.date` is a plain `DateTime`, so the time was *stored*.
 *     That is a second stock card for the same day, and `@@unique([materialId,
 *     date])` cannot catch it because the two values genuinely differ.
 *
 * A bare `YYYY-MM-DD` is taken at face value: the caller named a calendar day
 * and no zone conversion should second-guess it. Anything carrying a time is
 * resolved to its **Manila** calendar day, matching `localToday()` and the
 * timezone rule in AGENTS.md — the bakery's day is the Manila one, and reading
 * the UTC day instead is wrong for the whole 00:00–08:00 baking shift.
 */
export function toUtcDay(value: string | Date): Date {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return parsed;
  }

  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new BadRequestException(`Invalid date: ${String(value)}`);
  }
  return new Date(`${MANILA_DAY.format(instant)}T00:00:00.000Z`);
}
