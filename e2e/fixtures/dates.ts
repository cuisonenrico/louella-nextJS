import { addDays, manilaToday } from '@/lib/manilaDate';
import { currentCutoff, cutoffOf, eachDate, weekdayOf, type Cutoff } from '@/lib/payroll/cutoff';

export { addDays, manilaToday };
export type { Cutoff };

export const today = (): string => manilaToday();
export const yesterday = (): string => addDays(today(), -1);

export function previousCutoff(): Cutoff {
  return cutoffOf(addDays(currentCutoff().periodStart, -1));
}

export function workingDays(c: Cutoff, restDays: number[]): string[] {
  return eachDate(c.periodStart, c.periodEnd).filter((d) => !restDays.includes(weekdayOf(d)));
}
