'use client';

import { useId, useState } from 'react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { peso } from '@/lib/payroll/format';
import type { CashDayView } from '@/types';
import { parseAmount } from './parseAmount';

const BADGE: Record<CashDayView['totals']['state'], { text: (n: number) => string; className: string }> = {
  NOT_COUNTED: { text: () => 'Not counted', className: 'bg-muted text-muted-foreground' },
  BALANCED: { text: () => 'Balanced', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  OVER: { text: (n) => `Over ${peso(Math.abs(n))}`, className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  SHORT: { text: (n) => `Short ${peso(Math.abs(n))}`, className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

const FIELD_LABEL = { sales: 'Sales', expenses: 'Expenses', vale: 'Vale' } as const;

/**
 * Sales − Expenses − Vale = Expected, the counted cash, and over/short.
 * The counted cash saves on blur or Enter, only when it changed.
 */
export default function CashReconciliation({
  day,
  canEdit,
  canVerify,
  onSaveCash,
  onVerify,
  onReopen,
  busy,
}: {
  day: CashDayView;
  canEdit: boolean;
  canVerify: boolean;
  onSaveCash: (value: number | null) => void;
  onVerify: () => void;
  onReopen: () => void;
  busy: boolean;
}) {
  const id = useId();
  const { totals } = day;
  const verified = day.status === 'VERIFIED';
  const [cashText, setCashText] = useState(totals.actualCash == null ? '' : String(totals.actualCash));
  // Follow the server's value when it changes (a save, a refetch). Done as a
  // render-time adjustment, as on the inventory page, not in an effect.
  const [syncedCash, setSyncedCash] = useState(totals.actualCash);
  if (syncedCash !== totals.actualCash) {
    setSyncedCash(totals.actualCash);
    setCashText(totals.actualCash == null ? '' : String(totals.actualCash));
  }

  const commitCash = () => {
    const trimmed = cashText.trim();
    const value = trimmed === '' ? null : trimmed === '0' ? 0 : parseAmount(trimmed);
    if (trimmed !== '' && value == null) return; // leave the bad text visible; aria-invalid marks it
    if (value === totals.actualCash) return;
    onSaveCash(value);
  };
  const badge = BADGE[totals.state];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-muted-foreground">Sales</dt>
        <dd className="text-right font-medium sm:text-left">{peso(totals.sales)}</dd>
        <dt className="text-muted-foreground">− Expenses</dt>
        <dd className="text-right sm:text-left">{peso(totals.expenses)}</dd>
        <dt className="text-muted-foreground">− Vale</dt>
        <dd className="text-right sm:text-left">{peso(totals.vale)}</dd>
        <dt className="font-semibold">= Expected cash</dt>
        <dd className="text-right font-semibold sm:text-left">{peso(totals.expected)}</dd>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${id}-cash`} className="text-xs text-muted-foreground">Counted cash</label>
          <Input
            id={`${id}-cash`}
            inputMode="decimal"
            className="w-36"
            value={cashText}
            disabled={!canEdit || verified || busy}
            onChange={(e) => setCashText(e.target.value)}
            onBlur={commitCash}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCash();
            }}
            aria-invalid={cashText.trim() !== '' && cashText.trim() !== '0' && parseAmount(cashText) == null}
          />
        </div>
        <Badge className={badge.className}>{badge.text(totals.overShort ?? 0)}</Badge>
      </div>

      {verified ? (
        <p className="text-xs text-muted-foreground">
          Verified by {day.verifiedBy ?? 'an admin'}
          {day.verifiedAt ? ` on ${dayjs(day.verifiedAt).format('MMM D, h:mm A')}` : ''}
        </p>
      ) : null}
      {totals.drift.map((d) => (
        <p key={d.field} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {FIELD_LABEL[d.field]} changed since verification: {peso(d.atVerify)} → {peso(d.now)}
        </p>
      ))}

      {canVerify ? (
        verified ? (
          <Button size="sm" variant="outline" onClick={onReopen} disabled={busy}>Reopen</Button>
        ) : (
          <Button size="sm" onClick={onVerify} disabled={busy || totals.actualCash == null}>Verify day</Button>
        )
      ) : null}
    </div>
  );
}
