/**
 * The bakery's calendar day, shared by the API and the app.
 *
 * The business day is the Manila one. Vercel functions always run in UTC and
 * browsers run in whatever zone the device is set to, so neither the process
 * clock nor `toISOString()` can be trusted to name the day: from 00:00 to 08:00
 * Manila — the early baking shift — the UTC date is still *yesterday*.
 */

const MANILA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });

const MS_PER_DAY = 86_400_000;

/** Today's date in Manila as `YYYY-MM-DD` (`en-CA` formats as ISO). */
export function manilaToday(now: Date = new Date()): string {
  return MANILA_DAY.format(now);
}

/**
 * Shift a `YYYY-MM-DD` calendar date by whole days.
 *
 * Pure UTC arithmetic on the date string, so the result never depends on the
 * zone of the machine running it.
 */
export function addDays(dateStr: string, days: number): string {
  const ts = new Date(`${dateStr}T00:00:00.000Z`).getTime();
  return new Date(ts + days * MS_PER_DAY).toISOString().slice(0, 10);
}
