'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseAmount } from './parseAmount';

export type CashLineOption = { value: string; label: string; requiresNote?: boolean };
export type CashLineValues = { optionId: number; amount: number; note: string };

/**
 * One line of the drawer section: pick (category or employee), amount, note.
 * Used for adding and for editing. A native select keeps it fast on phones and
 * testable; the lists are short.
 */
export default function CashLineForm({
  pickLabel,
  options,
  onSubmit,
  onCancel,
  submitLabel,
  pending = false,
  initial,
}: {
  pickLabel: string;
  options: CashLineOption[];
  onSubmit: (values: CashLineValues) => void;
  onCancel?: () => void;
  submitLabel: string;
  pending?: boolean;
  initial?: { optionId: number; amount: number; note: string | null };
}) {
  const id = useId();
  const [optionId, setOptionId] = useState(initial ? String(initial.optionId) : '');
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '');
  const [note, setNote] = useState(initial?.note ?? '');

  const amount = parseAmount(amountText);
  const option = options.find((o) => o.value === optionId);
  const noteMissing = option?.requiresNote === true && note.trim() === '';
  const ready = option != null && amount != null && !noteMissing && !pending;

  const submit = () => {
    if (!ready) return;
    onSubmit({ optionId: Number(optionId), amount: amount!, note: note.trim() });
  };

  return (
    <form
      className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor={`${id}-pick`} className="text-xs text-muted-foreground">{pickLabel}</label>
        <select
          id={`${id}-pick`}
          value={optionId}
          onChange={(e) => setOptionId(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-amount`} className="text-xs text-muted-foreground">Amount</label>
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-invalid={amountText !== '' && amount == null}
        />
      </div>
      <div>
        <label htmlFor={`${id}-note`} className="text-xs text-muted-foreground">Note</label>
        <Input
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder={option?.requiresNote ? 'Required' : 'Optional'}
        />
      </div>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <Button type="submit" size="sm" disabled={!ready}>
          {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        ) : null}
      </div>
    </form>
  );
}
