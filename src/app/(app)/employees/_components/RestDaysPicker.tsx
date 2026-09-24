'use client';

import { cn } from '@/lib/utils';
import { WEEKDAYS } from '@/lib/payroll/format';

/** Weekdays off. At most six: an employee needs a working day to be paid. */
export function RestDaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const toggle = (day: number) =>
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b));

  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Rest days">
      {WEEKDAYS.map((label, day) => {
        const on = value.includes(day);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            disabled={!on && value.length >= 6}
            onClick={() => toggle(day)}
            className={cn(
              'h-9 w-11 rounded-md border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
