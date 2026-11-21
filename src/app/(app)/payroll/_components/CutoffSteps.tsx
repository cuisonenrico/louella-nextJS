import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'OPEN', label: 'Open', hint: 'absences and adjustments still change it' },
  { key: 'FINALIZED', label: 'Finalized', hint: 'payslips frozen' },
  { key: 'PAID', label: 'Paid', hint: 'marked paid' },
] as const;

/** Where a cutoff is in its life: open → finalized → paid. */
export function CutoffSteps({ status }: { status: 'OPEN' | 'FINALIZED' | 'PAID' }) {
  const at = STEPS.findIndex((s) => s.key === status);
  return (
    <ol aria-label="Cutoff status" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {STEPS.map((s, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <li key={s.key} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className={cn('h-px w-6', i <= at ? 'bg-primary' : 'bg-border')} />}
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs font-semibold',
                done && 'border-primary bg-primary text-primary-foreground',
                current && 'border-primary text-primary ring-2 ring-primary/20',
                !done && !current && 'text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={cn(current ? 'font-semibold' : 'text-muted-foreground')} title={s.hint}>
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
