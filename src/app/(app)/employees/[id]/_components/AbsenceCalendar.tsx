'use client';

import type { Absence } from '@/types';
import { cn } from '@/lib/utils';
import { cutoffOf, eachDate, weekdayOf } from '@/lib/payroll/cutoff';
import { WEEKDAYS } from '@/lib/payroll/format';

export interface AbsenceCalendarProps {
  /** `YYYY-MM` */
  month: string;
  restDays: number[];
  hiredOn: string;
  separatedOn: string | null;
  absences: Absence[];
  /** periodStarts of finalized or paid cutoffs. */
  lockedPeriodStarts: ReadonlySet<string>;
  onToggle: (date: string, existing: Absence | undefined) => void;
  pending?: boolean;
}

/** One month. Present is the default; clicking a working day toggles an absence. */
export function AbsenceCalendar({
  month,
  restDays,
  hiredOn,
  separatedOn,
  absences,
  lockedPeriodStarts,
  onToggle,
  pending = false,
}: AbsenceCalendarProps) {
  const first = `${month}-01`;
  const days = eachDate(first, cutoffOf(`${month}-16`).periodEnd);
  const byDate = new Map(absences.map((a) => [a.date, a]));

  return (
    <div className="grid grid-cols-7 gap-1 text-center text-sm">
      {WEEKDAYS.map((w) => (
        <div key={w} className="py-1 text-xs font-medium text-muted-foreground">{w}</div>
      ))}
      {Array.from({ length: weekdayOf(first) }, (_, i) => <div key={`blank-${i}`} />)}
      {days.map((date) => {
        const existing = byDate.get(date);
        const rest = restDays.includes(weekdayOf(date));
        const employed = date >= hiredOn && (separatedOn === null || date <= separatedOn);
        const locked = lockedPeriodStarts.has(cutoffOf(date).periodStart);
        const reason = rest
          ? 'Rest day'
          : !employed
            ? 'Not employed'
            : locked
              ? 'Cutoff finalized'
              : existing
                ? 'Absent — click to clear'
                : 'Present — click to mark absent';
        return (
          <button
            key={date}
            type="button"
            aria-label={date}
            aria-pressed={existing !== undefined}
            title={reason}
            disabled={pending || rest || !employed || locked}
            onClick={() => onToggle(date, existing)}
            className={cn(
              'h-10 rounded-md border text-sm transition-colors disabled:cursor-not-allowed',
              rest || !employed ? 'bg-muted text-muted-foreground/60' : 'hover:bg-accent',
              existing && 'border-destructive bg-destructive/10 font-semibold text-destructive',
              locked && !rest && employed && 'opacity-60',
            )}
          >
            {Number(date.slice(8))}
          </button>
        );
      })}
    </div>
  );
}
