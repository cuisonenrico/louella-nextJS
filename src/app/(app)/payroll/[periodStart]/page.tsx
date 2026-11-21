'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search } from 'lucide-react';
import { toast } from 'sonner';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { payrollApi } from '@/lib/apiServices';
import type { CutoffHoliday, DraftPayslip, PayrollAdjustmentKind } from '@/types';
import { extractError } from '@/lib/errors';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';
import { cutoffOf, formatCutoff, isPeriodStart } from '@/lib/payroll/cutoff';
import { peso } from '@/lib/payroll/format';
import { NO_COMPANY, draftHealth, filterSlips, slipTotals } from '@/lib/payroll/dashboard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import QueryError from '@/components/QueryError';
import { AdjustmentDialog, type AdjustmentInput } from '../_components/AdjustmentDialog';
import { CutoffTable, type SlipRow } from '../_components/CutoffTable';
import { EmployeeInputsDialog, type EmployeeInputsTarget } from '../_components/EmployeeInputsDialog';
import { FinalizeBar } from '../_components/FinalizeBar';
import { HolidaysPanel } from '../_components/HolidaysPanel';
import { RunActions } from '../_components/RunActions';
import { CutoffSteps } from '../_components/CutoffSteps';
import { Stat } from '../_components/Stat';

type Target = { employeeId: number; employeeName: string; kind: PayrollAdjustmentKind };

export default function CutoffPage() {
  const { periodStart } = useParams<{ periodStart: string }>();
  const valid = isPeriodStart(periodStart);
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);
  const [finalizeKey, renewFinalizeKey] = useIdempotencyKey();
  const [adjustKey, renewAdjustKey] = useIdempotencyKey();
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [inputsTarget, setInputsTarget] = useState<EmployeeInputsTarget | null>(null);
  usePageHeader({ title: valid ? `Payroll · ${formatCutoff(cutoffOf(periodStart))}` : 'Payroll' });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'cutoff', periodStart],
    queryFn: () => payrollApi.cutoff(periodStart).then((r) => r.data),
    enabled: valid,
  });
  const allRows: SlipRow[] = useMemo(
    () => data?.draft?.payslips ?? data?.run?.payslips.map((p): SlipRow => ({ ...p, payslipId: p.id })) ?? [],
    [data],
  );
  const rows = useMemo(() => filterSlips(allRows, { query, company, warningsOnly }), [allRows, query, company, warningsOnly]);
  const totals = useMemo(() => slipTotals(rows), [rows]);
  const companies = useMemo(
    () => [...new Set(allRows.map((r) => r.companyName ?? null))].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b))),
    [allRows],
  );
  const filtered = rows.length !== allRows.length;
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });
  const onError = (err: unknown) => toast.error(extractError(err));

  const finalize = useMutation({
    mutationFn: () => payrollApi.finalize(periodStart, finalizeKey),
    onSuccess: () => { renewFinalizeKey(); refresh(); toast.success('Payroll finalized'); },
    onError,
  });
  const addAdjustment = useMutation({
    mutationFn: ({ t, input }: { t: Target; input: AdjustmentInput }) =>
      payrollApi.addAdjustment({ employeeId: t.employeeId, periodStart, kind: t.kind, ...input }, adjustKey),
    onSuccess: () => { renewAdjustKey(); setTarget(null); refresh(); },
    onError,
  });
  const removeAdjustment = useMutation({
    mutationFn: (id: number) => payrollApi.removeAdjustment(id),
    onSuccess: refresh,
    onError,
  });
  const toggleSkip = useMutation({
    mutationFn: ({ employeeId, recurring }: { employeeId: number; recurring: DraftPayslip['recurring'][number] }) =>
      recurring.skipId !== null
        ? payrollApi.unskip(recurring.skipId)
        : payrollApi.skip(periodStart, { employeeId, recurringDeductionId: recurring.id }),
    onSuccess: refresh,
    onError,
  });
  const toggleRestDayWork = useMutation({
    mutationFn: ({ holiday, employee }: { holiday: CutoffHoliday; employee: CutoffHoliday['restDayEmployees'][number] }) =>
      employee.markId !== null
        ? payrollApi.unmarkRestDayWork(employee.markId)
        : payrollApi.markRestDayWork(holiday.id, employee.employeeId),
    onSuccess: refresh,
    onError,
  });

  if (!valid) {
    return <Alert variant="destructive"><AlertDescription>A cutoff starts on the 1st or the 16th.</AlertDescription></Alert>;
  }
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const busy = removeAdjustment.isPending || toggleSkip.isPending || addAdjustment.isPending || toggleRestDayWork.isPending;

  const health = data.draft ? draftHealth(data.draft.payslips) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/payroll"><ArrowLeft className="mr-1 h-4 w-4" />All cutoffs</Link>
          </Button>
          <CutoffSteps status={data.status} />
        </div>
        {data.run && <RunActions run={data.run} />}
      </div>

      {/* What the payslips on screen add up to */}
      <div role="region" aria-label="Cutoff totals" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Stat label="Employees" value={filtered ? `${totals.employees} of ${allRows.length}` : String(totals.employees)} />
        <Stat label="Basic pay" value={peso(totals.basicPay)} />
        <Stat label="Holiday pay" value={peso(totals.holidayPay)} />
        <Stat label="Additions" value={peso(totals.additions)} />
        <Stat label="Deductions" value={peso(totals.deductions)} />
        <Stat label="Net pay" value={peso(totals.netPay)} tone={totals.netPay < 0 ? 'danger' : undefined} />
        <Stat label="Employer share" value={peso(totals.employerShare)} />
      </div>

      <HolidaysPanel
        holidays={data.holidays}
        editable={data.status === 'OPEN'}
        busy={busy}
        onToggle={(holiday, employee) => toggleRestDayWork.mutate({ holiday, employee })}
      />

      {allRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Search employees"
              placeholder="Search name, role or branch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          {companies.length > 1 && (
            <Select value={company || 'all'} onValueChange={(v) => setCompany(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c ?? NO_COMPANY} value={c ?? NO_COMPANY}>{c ?? 'No company'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {health && (
            <div className="flex items-center gap-2">
              <Switch id="warnings-only" checked={warningsOnly} onCheckedChange={setWarningsOnly} />
              <Label htmlFor="warnings-only" className="text-sm font-normal">
                Only with warnings ({health.blocking + health.review})
              </Label>
            </div>
          )}
        </div>
      )}

      {data.draft && (
        <>
          <CutoffTable
            rows={rows}
            emptyText={filtered ? 'No employee matches these filters.' : undefined}
            actions={{
              busy,
              onAdd: (row, kind) => setTarget({ employeeId: row.employeeId, employeeName: row.employeeName, kind }),
              onRemoveAdjustment: (id) => removeAdjustment.mutate(id),
              onToggleSkip: (row, recurring) => toggleSkip.mutate({ employeeId: row.employeeId, recurring }),
              onEditInputs: (row, tab) => setInputsTarget({ employeeId: row.employeeId, employeeName: row.employeeName, tab }),
            }}
          />
          {/* Stays in reach at the end of a long list; totals are always the whole cutoff. */}
          <div className="sticky bottom-20 z-10 md:bottom-4">
            <FinalizeBar draft={data.draft} onFinalize={() => finalize.mutate()} pending={finalize.isPending} />
          </div>
        </>
      )}

      {data.run && (
        <CutoffTable rows={rows} emptyText={filtered ? 'No employee matches these filters.' : undefined} />
      )}

      {inputsTarget && (
        <EmployeeInputsDialog target={inputsTarget} periodStart={periodStart} onClose={() => setInputsTarget(null)} />
      )}

      {target && (
        <AdjustmentDialog
          kind={target.kind}
          employeeName={target.employeeName}
          pending={addAdjustment.isPending}
          onSubmit={(input) => addAdjustment.mutate({ t: target, input })}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
