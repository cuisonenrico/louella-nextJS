'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CalendarDays, CircleCheck } from 'lucide-react';
import { payrollApi } from '@/lib/apiServices';
import type { CutoffDraft } from '@/types';
import type { Cutoff } from '@/lib/payroll/cutoff';
import { formatCutoff } from '@/lib/payroll/cutoff';
import { daysLeft, draftHealth } from '@/lib/payroll/dashboard';
import { peso } from '@/lib/payroll/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import QueryError from '@/components/QueryError';
import { RunStatusBadge } from './RunStatusBadge';
import { Stat } from './Stat';

/**
 * The cutoff in progress: what it will cost so far, who needs attention before it
 * can be finalized, and the way in. Shares its query with the cutoff page, so
 * opening it is instant.
 */
export function CurrentCutoffCard({ cutoff, today }: { cutoff: Cutoff; today: string }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'cutoff', cutoff.periodStart],
    queryFn: () => payrollApi.cutoff(cutoff.periodStart).then((r) => r.data),
  });

  return (
    <Card role="region" aria-label="Current cutoff" className="gap-0 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current cutoff</p>
          <h2 className="font-display text-xl font-semibold">{formatCutoff(cutoff)}</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {daysLeft(today, cutoff.periodEnd) === 0
              ? 'Last day today'
              : `${daysLeft(today, cutoff.periodEnd)} day${daysLeft(today, cutoff.periodEnd) === 1 ? '' : 's'} left`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data && <RunStatusBadge status={data.status} />}
          <Button asChild>
            <Link href={`/payroll/${cutoff.periodStart}`}>
              {data?.status === 'OPEN' ? 'Review cutoff' : 'Open cutoff'} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)}
        </div>
      ) : isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data?.draft ? (
        <DraftSummary draft={data.draft} holidays={data.holidays.map((h) => h.name)} />
      ) : data?.run ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Employees" value={String(data.run.employeeCount)} />
          <Stat label="Net pay" value={peso(data.run.totalNetPay)} />
          <Stat label="Employer share" value={peso(data.run.totalEmployerShare)} />
        </div>
      ) : null}
    </Card>
  );
}

function DraftSummary({
  draft,
  holidays,
}: {
  draft: CutoffDraft;
  holidays: string[];
}) {
  const health = draftHealth(draft.payslips);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Employees" value={String(draft.totals.employeeCount)} />
        <Stat label="Projected net pay" value={peso(draft.totals.netPay)} hint="if everyone works the days left" />
        <Stat label="Employer share" value={peso(draft.totals.employerShare)} />
        <Stat label="Holidays" value={String(holidays.length)} hint={holidays.join(', ') || 'none this cutoff'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {health.blocking > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {health.blocking} employee{health.blocking === 1 ? '' : 's'} block finalizing
          </span>
        )}
        {health.review > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {health.review} to review
          </span>
        )}
        {health.blocking === 0 && health.review === 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 font-medium text-green-800 dark:bg-green-950/40 dark:text-green-200">
            <CircleCheck className="h-4 w-4" aria-hidden />
            No warnings
          </span>
        )}
      </div>
    </>
  );
}
