'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { branchCashApi, branchesApi } from '@/lib/apiServices';
import { addDays, manilaToday } from '@/lib/manilaDate';
import { peso } from '@/lib/payroll/format';
import { useCan } from '@/lib/rbac/useHasFeature';
import type { Branch, CashDayTotals, CashSummaryRow } from '@/types';
import BranchCashPanel from '@/components/branch-cash/BranchCashPanel';
import QueryError from '@/components/QueryError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import CategoriesDialog from './_components/CategoriesDialog';

function stateLabel(t: CashDayTotals): string {
  if (t.state === 'NOT_COUNTED') return 'Not counted';
  if (t.state === 'BALANCED') return 'Balanced';
  return `${t.state === 'OVER' ? 'Over' : 'Short'} ${peso(Math.abs(t.overShort ?? 0))}`;
}

const STATE_CLASS: Record<CashDayTotals['state'], string> = {
  NOT_COUNTED: 'text-muted-foreground',
  BALANCED: 'text-green-700 dark:text-green-400',
  OVER: 'text-amber-700 dark:text-amber-400',
  SHORT: 'text-red-700 dark:text-red-400',
};

/**
 * Every branch-day's drawer for a period: sales, expenses, vale, expected and
 * counted cash. Opening a row shows the same panel managers fill in, where an
 * admin verifies it.
 */
export default function CashReportsPage() {
  usePageHeader({ title: 'Cash Reports' });
  const allBranches = useCan('all-branches');
  const canManageCategories = useCan('branch-cash:categories');
  const today = manilaToday();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [openRow, setOpenRow] = useState<CashSummaryRow | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
    enabled: allBranches,
  });
  const summaryQuery = useQuery({
    queryKey: ['branch-cash', 'summary', from, to, branchId, unverified],
    queryFn: () =>
      branchCashApi
        .summary({ from, to, branchId: branchId ? Number(branchId) : undefined, unverified })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cash-from" className="text-xs text-muted-foreground">From</label>
          <Input id="cash-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cash-to" className="text-xs text-muted-foreground">To</label>
          <Input id="cash-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </div>
        {allBranches ? (
          <div>
            <label htmlFor="cash-branch" className="text-xs text-muted-foreground">Branch</label>
            <select
              id="cash-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={unverified} onCheckedChange={setUnverified} />
          Unverified only
        </label>
        {canManageCategories ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setCategoriesOpen(true)}>
            Categories
          </Button>
        ) : null}
      </div>

      {summaryQuery.isError ? (
        <QueryError error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
      ) : !summary ? null : (
        <>
          <p className="text-sm text-muted-foreground">
            {summary.totals.unverifiedDays} of {summary.totals.days} days unverified
          </p>

          {/* Phones: one card per branch-day. */}
          <ul className="space-y-2 md:hidden">
            {summary.rows.map((r) => (
              <li key={`${r.branchId}|${r.date}`}>
                <button
                  type="button"
                  onClick={() => setOpenRow(r)}
                  className="w-full rounded-lg border p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.branchName}</span>
                    <Badge variant={r.status === 'VERIFIED' ? 'default' : 'outline'}>
                      {r.status === 'VERIFIED' ? 'Verified' : 'Open'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{dayjs(r.date).format('ddd, MMM D')}</div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span>Expected {peso(r.totals.expected)}</span>
                    <span className={STATE_CLASS[r.totals.state]}>{stateLabel(r.totals)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Wider screens: the table. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Vale</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead>Over / short</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map((r) => (
                  <TableRow key={`${r.branchId}|${r.date}`} className="cursor-pointer" onClick={() => setOpenRow(r)}>
                    <TableCell>{dayjs(r.date).format('ddd, MMM D')}</TableCell>
                    <TableCell>{r.branchName}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.sales)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.expenses)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.vale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.expected)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totals.actualCash == null ? '—' : peso(r.totals.actualCash)}
                    </TableCell>
                    <TableCell className={STATE_CLASS[r.totals.state]}>{stateLabel(r.totals)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'VERIFIED' ? 'default' : 'outline'}>
                        {r.status === 'VERIFIED' ? 'Verified' : 'Open'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.expenses)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.vale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.expected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.actualCash)}</TableCell>
                  <TableCell colSpan={2}>{peso(summary.totals.overShort)} on counted days</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      <Sheet open={openRow != null} onOpenChange={(v) => !v && setOpenRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {openRow ? `${openRow.branchName} — ${dayjs(openRow.date).format('ddd, MMM D, YYYY')}` : ''}
            </SheetTitle>
          </SheetHeader>
          {openRow ? <BranchCashPanel branchId={openRow.branchId} date={openRow.date} /> : null}
        </SheetContent>
      </Sheet>

      {canManageCategories ? <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} /> : null}
    </div>
  );
}
