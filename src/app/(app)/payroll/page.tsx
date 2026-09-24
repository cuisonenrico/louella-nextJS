'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { payrollApi } from '@/lib/apiServices';
import { manilaToday } from '@/lib/manilaDate';
import { currentCutoff, formatCutoff } from '@/lib/payroll/cutoff';
import { peso } from '@/lib/payroll/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';
import { RunStatusBadge } from './_components/RunStatusBadge';

export default function PayrollPage() {
  usePageHeader({ title: 'Payroll' });
  const [year, setYear] = useState(() => Number(manilaToday().slice(0, 4)));
  const current = currentCutoff().periodStart;

  const { data: cutoffs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['payroll', 'cutoffs', year],
    queryFn: () => payrollApi.cutoffs(year).then((r) => r.data),
  });

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="w-16 text-center font-semibold">{year}</span>
        <Button variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear((y) => y + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <Card className="overflow-x-auto">
        <Table>
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
            ) : isError ? (
              <TableRow><TableCell colSpan={5} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
            ) : (
              cutoffs.map((c) => (
                <TableRow key={c.periodStart} className={cn(c.periodStart === current && 'bg-accent/40')}>
                  <TableCell className="font-medium">
                    <Link href={`/payroll/${c.periodStart}`} className="hover:underline">{formatCutoff(c)}</Link>
                    {c.periodStart === current && <span className="ml-2 text-xs text-muted-foreground">current</span>}
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
      </Card>
    </>
  );
}
