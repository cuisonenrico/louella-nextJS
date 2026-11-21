'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, Settings, Users } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { payrollApi } from '@/lib/apiServices';
import { manilaToday } from '@/lib/manilaDate';
import { currentCutoff, formatCutoff } from '@/lib/payroll/cutoff';
import { summarizePayrollYear } from '@/lib/payroll/dashboard';
import { peso } from '@/lib/payroll/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';
import { PayrollTrendChart } from '@/components/charts/lazy';
import { CurrentCutoffCard } from './_components/CurrentCutoffCard';
import { RunStatusBadge } from './_components/RunStatusBadge';
import { Stat } from './_components/Stat';

/**
 * Payroll dashboard: the cutoff in progress, the year so far, what is waiting on
 * someone (cutoffs past their end still open, runs not marked paid), net pay per
 * cutoff, and every cutoff of the year.
 */
export default function PayrollPage() {
  usePageHeader({ title: 'Payroll' });
  const today = manilaToday();
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const current = currentCutoff();

  const { data: cutoffs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'cutoffs', year],
    queryFn: () => payrollApi.cutoffs(year).then((r) => r.data),
  });
  const summary = useMemo(() => summarizePayrollYear(cutoffs, today), [cutoffs, today]);
  const attention = summary.overdue.length + summary.unpaid.length;
  // Cutoffs that have started; later ones have nothing to show yet.
  const started = useMemo(() => cutoffs.filter((c) => c.periodStart <= today), [cutoffs, today]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="w-16 text-center font-semibold">{year}</span>
          <Button variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear((y) => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/employees"><Users className="mr-1 h-4 w-4" />Employees</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/payroll"><Settings className="mr-1 h-4 w-4" />Holidays &amp; multipliers</Link>
          </Button>
        </div>
      </div>

      {year === thisYear && <CurrentCutoffCard cutoff={current} today={today} />}

      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          {/* The year so far */}
          <div role="region" aria-label={`${year} so far`} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[72px]" />)
            ) : (
              <>
                <Stat label="Net pay" value={peso(summary.netPay)} hint={`finalized runs in ${year}`} />
                <Stat label="Employer share" value={peso(summary.employerShare)} hint="recorded, not deducted" />
                <Stat
                  label="Cutoffs finalized"
                  value={String(summary.finalized)}
                  hint={summary.overdue.length ? `${summary.overdue.length} ended and still open` : 'none overdue'}
                />
                <Stat label="Paid" value={`${summary.paid} of ${summary.finalized}`} hint="finalized runs marked paid" />
              </>
            )}
          </div>

          {attention > 0 && (
            <Card role="region" aria-label="Waiting on you" className="gap-2 border-amber-300 p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" aria-hidden /> Waiting on you
              </p>
              <ul className="divide-y text-sm">
                {summary.overdue.map((c) => (
                  <li key={c.periodStart} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{formatCutoff(c)}</span> has ended and is not finalized</span>
                    <Button size="sm" variant="outline" asChild><Link href={`/payroll/${c.periodStart}`}>Finalize</Link></Button>
                  </li>
                ))}
                {summary.unpaid.map((c) => (
                  <li key={c.periodStart} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span><span className="font-medium">{formatCutoff(c)}</span> is finalized ({peso(c.totalNetPay ?? 0)}) but not marked paid</span>
                    </span>
                    <Button size="sm" variant="outline" asChild><Link href={`/payroll/${c.periodStart}`}>Open</Link></Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid items-start gap-4 xl:grid-cols-5">
            {/* Net pay per cutoff */}
            <Card className="gap-2 p-4 xl:col-span-2">
              <h3 className="font-semibold">Net pay per cutoff, {year}</h3>
              {isLoading ? (
                <Skeleton className="h-[240px]" />
              ) : summary.trend.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No payroll finalized in {year} yet.
                </p>
              ) : (
                <PayrollTrendChart data={summary.trend} height={240} />
              )}
            </Card>

            {/* Every cutoff */}
            <Card className="gap-0 overflow-x-auto p-0 xl:col-span-3">
              <h3 className="px-4 pt-4 pb-2 font-semibold">All cutoffs</h3>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Cutoff</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Employees</TableHead>
                    <TableHead className="text-right">Net pay</TableHead>
                    <TableHead className="text-right">Employer share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRowsSkeleton rows={8} columns={5} />
                  ) : (
                    started.map((c) => (
                      <TableRow key={c.periodStart} className={cn(c.periodStart === current.periodStart && 'bg-accent/40')}>
                        <TableCell className="font-medium">
                          <Link href={`/payroll/${c.periodStart}`} className="hover:underline">{formatCutoff(c)}</Link>
                          {c.periodStart === current.periodStart && <span className="ml-2 text-xs text-muted-foreground">current</span>}
                        </TableCell>
                        <TableCell className="space-x-1">
                          <RunStatusBadge status={c.status} />
                          {c.voidedRuns > 0 && <span className="text-xs text-muted-foreground">{c.voidedRuns} voided</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.employeeCount ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.totalNetPay === null ? '—' : peso(c.totalNetPay)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.totalEmployerShare === null ? '—' : peso(c.totalEmployerShare)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {/* Phones: one line per cutoff. */}
              <ul className="divide-y border-t md:hidden">
                {started.map((c) => (
                  <li key={c.periodStart}>
                    <Link
                      href={`/payroll/${c.periodStart}`}
                      className={cn('flex items-center justify-between gap-3 px-4 py-3', c.periodStart === current.periodStart && 'bg-accent/40')}
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{formatCutoff(c)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {c.periodStart === current.periodStart ? 'current · ' : ''}
                          {c.employeeCount === null ? 'not finalized' : `${c.employeeCount} employees`}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {c.totalNetPay !== null && <span className="text-sm font-semibold tabular-nums">{peso(c.totalNetPay)}</span>}
                        <RunStatusBadge status={c.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {!isLoading && started.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No cutoff of {year} has started yet.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
