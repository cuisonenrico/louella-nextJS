import { cn } from '@/lib/utils';

/** A labelled figure; `role=group` names it for assistive tech and tests. */
export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold tabular-nums', tone === 'danger' && 'text-destructive')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hint}>{hint}</p>}
    </div>
  );
}
