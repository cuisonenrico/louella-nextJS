'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { payrollApi } from '@/lib/apiServices';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import QueryError from '@/components/QueryError';
import { PayslipView } from '../../_components/PayslipView';

export default function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const payslipId = Number(id);
  const { data: slip, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'payslip', payslipId],
    queryFn: () => payrollApi.payslip(payslipId).then((r) => r.data),
    enabled: Number.isInteger(payslipId) && payslipId > 0,
  });
  usePageHeader({ title: slip ? `Payslip · ${slip.employeeName}` : 'Payslip' });

  if (isLoading) return <Skeleton className="h-96 w-full max-w-2xl" />;
  if (isError) return <QueryError error={error} onRetry={() => refetch()} />;
  if (!slip) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/payroll/${slip.run.periodStart}`}><ArrowLeft className="mr-1 h-4 w-4" />Cutoff</Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
      </div>
      <PayslipView slip={slip} run={slip.run} />
    </div>
  );
}
