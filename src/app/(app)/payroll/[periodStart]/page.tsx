'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { payrollApi } from '@/lib/apiServices';
import type { DraftPayslip, PayrollAdjustmentKind } from '@/types';
import { extractError } from '@/lib/errors';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';
import { cutoffOf, formatCutoff, isPeriodStart } from '@/lib/payroll/cutoff';
import { peso } from '@/lib/payroll/format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QueryError from '@/components/QueryError';
import { AdjustmentDialog, type AdjustmentInput } from '../_components/AdjustmentDialog';
import { CutoffTable, type SlipRow } from '../_components/CutoffTable';
import { FinalizeBar } from '../_components/FinalizeBar';
import { RunActions } from '../_components/RunActions';
import { RunStatusBadge } from '../_components/RunStatusBadge';

type Target = { employeeId: number; employeeName: string; kind: PayrollAdjustmentKind };

export default function CutoffPage() {
  const { periodStart } = useParams<{ periodStart: string }>();
  const valid = isPeriodStart(periodStart);
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);
  const [finalizeKey, renewFinalizeKey] = useIdempotencyKey();
  const [adjustKey, renewAdjustKey] = useIdempotencyKey();
  usePageHeader({ title: valid ? `Payroll · ${formatCutoff(cutoffOf(periodStart))}` : 'Payroll' });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'cutoff', periodStart],
    queryFn: () => payrollApi.cutoff(periodStart).then((r) => r.data),
    enabled: valid,
  });
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

  if (!valid) {
    return <Alert variant="destructive"><AlertDescription>A cutoff starts on the 1st or the 16th.</AlertDescription></Alert>;
  }
  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!data) return null;

  const busy = removeAdjustment.isPending || toggleSkip.isPending || addAdjustment.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/payroll"><ArrowLeft className="mr-1 h-4 w-4" />All cutoffs</Link>
          </Button>
          <RunStatusBadge status={data.status} />
        </div>
        {data.run && <RunActions run={data.run} />}
      </div>

      {data.draft && (
        <>
          <CutoffTable
            rows={data.draft.payslips}
            actions={{
              busy,
              onAdd: (row, kind) => setTarget({ employeeId: row.employeeId, employeeName: row.employeeName, kind }),
              onRemoveAdjustment: (id) => removeAdjustment.mutate(id),
              onToggleSkip: (row, recurring) => toggleSkip.mutate({ employeeId: row.employeeId, recurring }),
            }}
          />
          <FinalizeBar draft={data.draft} onFinalize={() => finalize.mutate()} pending={finalize.isPending} />
        </>
      )}

      {data.run && (
        <>
          <p className="text-sm text-muted-foreground">
            {data.run.employeeCount} employees · Net pay <strong>{peso(data.run.totalNetPay)}</strong> · Employer share{' '}
            {peso(data.run.totalEmployerShare)}
          </p>
          <CutoffTable
            rows={data.run.payslips.map((p): SlipRow => ({ ...p, payslipId: p.id }))}
          />
        </>
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
