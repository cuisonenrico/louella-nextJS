'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { payrollApi } from '@/lib/apiServices';
import { formatCutoff } from '@/lib/payroll/cutoff';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QueryError from '@/components/QueryError';
import { PayslipView } from '../../../_components/PayslipView';

/** Every payslip of a run, two to an A4 page. */
export default function PrintRunPage() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const { data: run, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'run', runId],
    queryFn: () => payrollApi.run(runId).then((r) => r.data),
    enabled: Number.isInteger(runId) && runId > 0,
  });
  usePageHeader({ title: run ? `Payslips · ${formatCutoff(run)}` : 'Payslips' });

  if (isLoading) return <Skeleton className="h-96 w-full max-w-2xl" />;
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!run) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/payroll/${run.periodStart}`}><ArrowLeft className="mr-1 h-4 w-4" />Cutoff</Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print {run.payslips.length} payslips</Button>
      </div>
      {run.payslips.map((slip, i) => (
        <PayslipView
          key={slip.id}
          slip={slip}
          run={run}
          className={cn('print:mb-4 print:rounded-none', i % 2 === 1 && 'print:break-after-page')}
        />
      ))}
    </div>
  );
}
