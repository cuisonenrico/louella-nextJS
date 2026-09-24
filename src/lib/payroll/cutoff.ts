import { addDays, manilaToday } from '../manilaDate';

/**
 * Semi-monthly payroll cutoffs: the 1st–15th and the 16th–last day, on the
 * Manila calendar. Shared by the API and the pages, so it imports nothing but
 * the Manila day helpers.
 *
 * Every date here is a `YYYY-MM-DD` string. Comparing them as strings is
 * comparing them as days.
 */

export interface Cutoff {
  periodStart: string;
  periodEnd: string;
  half: 1 | 2;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/** True for a real calendar day in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** True for the 1st or 16th of a month — the only valid cutoff identifiers. */
export function isPeriodStart(value: string): boolean {
  return isCalendarDate(value) && (value.endsWith('-01') || value.endsWith('-16'));
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The cutoff containing `date`. */
export function cutoffOf(date: string): Cutoff {
  if (!isCalendarDate(date)) throw new Error(`Not a calendar date: ${date}`);
  const [, y, m, d] = DATE_ONLY.exec(date)!;
  const ym = `${y}-${m}`;
  if (Number(d) <= 15) return { periodStart: `${ym}-01`, periodEnd: `${ym}-15`, half: 1 };
  const last = lastDayOfMonth(Number(y), Number(m));
  return { periodStart: `${ym}-16`, periodEnd: `${ym}-${pad(last)}`, half: 2 };
}

/** The cutoff containing today in Manila. */
export function currentCutoff(now: Date = new Date()): Cutoff {
  return cutoffOf(manilaToday(now));
}

export function cutoffsOfYear(year: number): Cutoff[] {
  const all: Cutoff[] = [];
  for (let month = 1; month <= 12; month++) {
    const ym = `${year}-${pad(month)}`;
    all.push(cutoffOf(`${ym}-01`), cutoffOf(`${ym}-16`));
  }
  return all;
}

/** Every date from `start` to `end`, both included. */
export function eachDate(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** 0 = Sunday … 6 = Saturday, independent of the machine's zone. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** `Sep 1–15, 2026`. */
export function formatCutoff(c: { periodStart: string; periodEnd: string }): string {
  const [y, m, d1] = c.periodStart.split('-');
  const d2 = c.periodEnd.slice(8);
  return `${MONTHS[Number(m) - 1]} ${Number(d1)}–${Number(d2)}, ${y}`;
}
