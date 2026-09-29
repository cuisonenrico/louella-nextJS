import { addDays, manilaToday } from '@/lib/manilaDate';
import { currentCutoff, cutoffOf, eachDate, weekdayOf, type Cutoff } from '@/lib/payroll/cutoff';

export { addDays, manilaToday };
export type { Cutoff };

export const today = (): string => manilaToday();
export const yesterday = (): string => addDays(today(), -1);

export function previousCutoff(): Cutoff {
  return cutoffOf(addDays(currentCutoff().periodStart, -1));
}

/** The cutoff immediately before `c`. Two consecutive cutoffs are always one 1–15 and one 16–end. */
export function cutoffBefore(c: Cutoff): Cutoff {
  return cutoffOf(addDays(c.periodStart, -1));
}

export function workingDays(c: Cutoff, restDays: number[]): string[] {
  return eachDate(c.periodStart, c.periodEnd).filter((d) => !restDays.includes(weekdayOf(d)));
}
