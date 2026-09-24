'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { branchCashApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { peso } from '@/lib/payroll/format';
import { useCan } from '@/lib/rbac/useHasFeature';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import CashLineForm, { type CashLineOption } from './CashLineForm';
import CashReconciliation from './CashReconciliation';

/** Every branch-cash query starts with this, so one invalidation refreshes them all. */
export const BRANCH_CASH_KEY = ['branch-cash'] as const;

type Editing = { kind: 'expense' | 'vale'; id: number } | null;

/**
 * The bottom of the paper inventory sheet: the day's expenses, vale and the
 * counted cash, with expected cash and over/short worked out.
 *
 * Each line saves on its own, independent of the inventory sheet's pending-save
 * bar. A verified day is read-only until an admin reopens it.
 */
export default function BranchCashPanel({ branchId, date }: { branchId: number; date: string }) {
  const qc = useQueryClient();
  const canCreate = useCan('branch-cash:create');
  const canEdit = useCan('branch-cash:edit');
  const canVoid = useCan('branch-cash:delete');
  const canVerify = useCan('branch-cash:verify');
  const [expenseKey, renewExpenseKey] = useIdempotencyKey();
  const [valeKey, renewValeKey] = useIdempotencyKey();
  const [editing, setEditing] = useState<Editing>(null);
  const [formVersion, setFormVersion] = useState(0);

  const dayQuery = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'day', branchId, date],
    queryFn: () => branchCashApi.day(branchId, date).then((r) => r.data),
  });
  const { data: categories = [] } = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'categories'],
    queryFn: () => branchCashApi.categories().then((r) => r.data),
  });
  const { data: employees = [] } = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'employees', branchId, date],
    queryFn: () => branchCashApi.employees(branchId, date).then((r) => r.data),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: BRANCH_CASH_KEY });
  const fail = (err: unknown) => {
    toast.error(extractError(err));
    refresh(); // a 409 means the day or cutoff was locked meanwhile: show it
  };
  const done = (message?: string) => {
    if (message) toast.success(message);
    setEditing(null);
    setFormVersion((v) => v + 1); // clears the add rows
    refresh();
  };

  const addExpense = useMutation({
    mutationFn: (v: { optionId: number; amount: number; note: string }) =>
      branchCashApi.createExpense(
        { branchId, date, categoryId: v.optionId, amount: v.amount, note: v.note || undefined },
        expenseKey,
      ),
    onSuccess: () => {
      renewExpenseKey();
      done();
    },
    onError: fail,
  });
  const addVale = useMutation({
    mutationFn: (v: { optionId: number; amount: number; note: string }) =>
      branchCashApi.createVale(
        { branchId, date, employeeId: v.optionId, amount: v.amount, note: v.note || undefined },
        valeKey,
      ),
    onSuccess: () => {
      renewValeKey();
      done();
    },
    onError: fail,
  });
  const editLine = useMutation({
    mutationFn: ({ kind, id, v }: { kind: 'expense' | 'vale'; id: number; v: { optionId: number; amount: number; note: string } }) =>
      kind === 'expense'
        ? branchCashApi.updateExpense(id, { categoryId: v.optionId, amount: v.amount, note: v.note || null })
        : branchCashApi.updateVale(id, { employeeId: v.optionId, amount: v.amount, note: v.note || null }),
    onSuccess: () => done('Saved'),
    onError: fail,
  });
  const voidLine = useMutation({
    mutationFn: ({ kind, id }: { kind: 'expense' | 'vale'; id: number }) =>
      kind === 'expense' ? branchCashApi.voidExpense(id) : branchCashApi.voidVale(id),
    onSuccess: () => done('Voided'),
    onError: fail,
  });
  const saveCash = useMutation({
    mutationFn: (actualCash: number | null) => branchCashApi.setActualCash({ branchId, date, actualCash }),
    onSuccess: () => done(),
    onError: fail,
  });
  const verify = useMutation({
    mutationFn: () => branchCashApi.verify(branchId, date),
    onSuccess: () => done('Day verified'),
    onError: fail,
  });
  const reopen = useMutation({
    mutationFn: () => branchCashApi.reopen(branchId, date),
    onSuccess: () => done('Day reopened'),
    onError: fail,
  });

  if (dayQuery.isLoading) return <Skeleton className="my-4 h-48 w-full rounded-lg" />;
  if (dayQuery.isError || !dayQuery.data) {
    return <p className="my-4 text-sm text-destructive">{extractError(dayQuery.error)}</p>;
  }

  const day = dayQuery.data;
  const open = day.status === 'OPEN';
  const categoryOptions: CashLineOption[] = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
    requiresNote: c.requiresNote,
  }));
  // An old line may sit in a category retired since; keep it pickable for
  // that line so its amount or note can still be corrected (the API allows it).
  const categoryOptionsFor = (category: { id: number; name: string }): CashLineOption[] =>
    categoryOptions.some((o) => o.value === String(category.id))
      ? categoryOptions
      : [...categoryOptions, { value: String(category.id), label: `${category.name} (retired)` }];
  const employeeOptions: CashLineOption[] = employees.map((e) => ({ value: String(e.id), label: e.name }));
  const busy = saveCash.isPending || verify.isPending || reopen.isPending;

  const lineActions = (kind: 'expense' | 'vale', id: number) =>
    open ? (
      <span className="flex gap-1">
        {canEdit ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit" onClick={() => setEditing({ kind, id })}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {canVoid ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Void"
            disabled={voidLine.isPending}
            onClick={() => voidLine.mutate({ kind, id })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </span>
    ) : null;

  return (
    <Card className="my-4 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-bold">Cash</CardTitle>
        <Badge variant={open ? 'outline' : 'default'}>{open ? 'Open' : 'Verified'}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses</h3>
          {day.expenses.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : null}
          {day.expenses.map((e) =>
            editing?.kind === 'expense' && editing.id === e.id ? (
              <CashLineForm
                key={e.id}
                pickLabel="Category"
                options={categoryOptionsFor(e.category)}
                initial={{ optionId: e.category.id, amount: e.amount, note: e.note }}
                submitLabel="Save"
                pending={editLine.isPending}
                onSubmit={(v) => editLine.mutate({ kind: 'expense', id: e.id, v })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {e.category.name}
                  {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{peso(e.amount)}</span>
                  {lineActions('expense', e.id)}
                </span>
              </div>
            ),
          )}
          {open && canCreate ? (
            <div data-testid="add-expense">
              <CashLineForm
                key={`expense-${formVersion}`}
                pickLabel="Category"
                options={categoryOptions}
                submitLabel="Add expense"
                pending={addExpense.isPending}
                onSubmit={(v) => addExpense.mutate(v)}
              />
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vale</h3>
          {day.vale.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : null}
          {day.vale.map((v) =>
            editing?.kind === 'vale' && editing.id === v.id ? (
              <CashLineForm
                key={v.id}
                pickLabel="Employee"
                options={employeeOptions}
                initial={{ optionId: v.employee.id, amount: v.amount, note: v.note }}
                submitLabel="Save"
                pending={editLine.isPending}
                onSubmit={(values) => editLine.mutate({ kind: 'vale', id: v.id, v: values })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {v.employee.name}
                  {v.note ? <span className="text-muted-foreground"> · {v.note}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{peso(v.amount)}</span>
                  {lineActions('vale', v.id)}
                </span>
              </div>
            ),
          )}
          {open && canCreate ? (
            <div data-testid="add-vale">
              <CashLineForm
                key={`vale-${formVersion}`}
                pickLabel="Employee"
                options={employeeOptions}
                submitLabel="Add vale"
                pending={addVale.isPending}
                onSubmit={(v) => addVale.mutate(v)}
              />
            </div>
          ) : null}
        </section>

        <Separator />

        <CashReconciliation
          day={day}
          canEdit={canCreate}
          canVerify={canVerify}
          busy={busy}
          onSaveCash={(value) => saveCash.mutate(value)}
          onVerify={() => verify.mutate()}
          onReopen={() => reopen.mutate()}
        />
      </CardContent>
    </Card>
  );
}
