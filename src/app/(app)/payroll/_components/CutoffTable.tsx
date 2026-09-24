'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react';
import type { DraftPayslip, PayslipLineView, PayslipWarning } from '@/types';
import { peso } from '@/lib/payroll/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** A draft payslip or a finalized one, as the table shows it. */
export interface SlipRow {
  employeeId: number;
  employeeName: string;
  jobRoleName: string;
  branchName: string | null;
  workingDays: number;
  absenceDays: number;
  daysWorked: number;
  basicPay: number;
  totalAdditions: number;
  totalDeductions: number;
  netPay: number;
  lines: PayslipLineView[];
  warnings?: PayslipWarning[];
  recurring?: DraftPayslip['recurring'];
  payslipId?: number;
}

export interface CutoffTableActions {
  onAdd: (row: SlipRow, kind: 'ADDITION' | 'DEDUCTION') => void;
  onRemoveAdjustment: (adjustmentId: number) => void;
  onToggleSkip: (row: SlipRow, recurring: DraftPayslip['recurring'][number]) => void;
  busy: boolean;
}

function WarningBadges({ row }: { row: SlipRow }) {
  return (
    <>
      {(row.warnings ?? []).map((w) =>
        w.code === 'MISSING_RATE' ? (
          <Badge key={w.code} variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            <Link href={`/employees/${row.employeeId}`} onClick={(e) => e.stopPropagation()}>
              No rate for {w.dates.length} day{w.dates.length === 1 ? '' : 's'}
            </Link>
          </Badge>
        ) : w.code === 'NEGATIVE_NET' ? (
          <Badge key={w.code} variant="destructive">Net pay below zero</Badge>
        ) : (
          <Badge key={w.code} variant="secondary">No days worked</Badge>
        ),
      )}
    </>
  );
}

function lineLabel(l: PayslipLineView): string {
  if (l.type === 'BASIC' && l.quantity !== null && l.rate !== null) {
    return `${l.label} — ${l.quantity} day${l.quantity === 1 ? '' : 's'} × ${peso(l.rate)}`;
  }
  return l.type === 'EMPLOYER_SHARE' ? `${l.label} · not deducted` : l.label;
}

function LineDetails({ row, actions }: { row: SlipRow; actions?: CutoffTableActions }) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {row.lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className={cn(l.type === 'EMPLOYER_SHARE' && 'text-muted-foreground')}>{lineLabel(l)}</span>
            <span className="flex items-center gap-1 tabular-nums">
              {l.type === 'DEDUCTION' ? `−${peso(l.amount)}` : peso(l.amount)}
              {actions && l.sourceType === 'PayrollAdjustment' && l.sourceId !== null && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Remove ${l.label}`}
                  disabled={actions.busy}
                  onClick={() => actions.onRemoveAdjustment(l.sourceId!)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {actions && row.recurring && row.recurring.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-muted-foreground">Monthly deductions this cutoff</p>
          {row.recurring.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <span>{r.name} ({peso(r.employeeShare)})</span>
              <Switch
                checked={r.skipId === null}
                disabled={actions.busy}
                onCheckedChange={() => actions.onToggleSkip(row, r)}
                aria-label={`Take ${r.name} this cutoff`}
              />
            </div>
          ))}
        </div>
      )}

      {actions ? (
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <Button size="sm" variant="outline" onClick={() => actions.onAdd(row, 'ADDITION')}><Plus className="mr-1 h-4 w-4" />Addition</Button>
          <Button size="sm" variant="outline" onClick={() => actions.onAdd(row, 'DEDUCTION')}><Minus className="mr-1 h-4 w-4" />Deduction</Button>
          <Button size="sm" variant="ghost" asChild><Link href={`/employees/${row.employeeId}`}>Absences &amp; rates</Link></Button>
        </div>
      ) : (
        row.payslipId !== undefined && (
          <Button size="sm" variant="outline" asChild><Link href={`/payroll/payslips/${row.payslipId}`}>View payslip</Link></Button>
        )
      )}
    </div>
  );
}

export function CutoffTable({ rows, actions }: { rows: SlipRow[]; actions?: CutoffTableActions }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Nobody was employed during this cutoff.</p>;
  }

  return (
    <>
      {/* Desktop: one row per employee, expanding to its lines. */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Working days</TableHead>
              <TableHead className="text-right">Absent</TableHead>
              <TableHead className="text-right">Worked</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">Additions</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const expanded = open.has(row.employeeId);
              return (
                <Fragment key={row.employeeId}>
                  <TableRow className="cursor-pointer" aria-expanded={expanded} onClick={() => toggle(row.employeeId)}>
                    <TableCell>{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.employeeName}</div>
                      <div className="text-xs text-muted-foreground">{row.jobRoleName}{row.branchName ? ` · ${row.branchName}` : ''}</div>
                      <div className="mt-1 flex flex-wrap gap-1"><WarningBadges row={row} /></div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.workingDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.absenceDays}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.daysWorked}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(row.basicPay)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(row.totalAdditions)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(row.totalDeductions)}</TableCell>
                    <TableCell className={cn('text-right font-semibold tabular-nums', row.netPay < 0 && 'text-destructive')}>
                      {peso(row.netPay)}
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow>
                      <TableCell />
                      <TableCell colSpan={8}><LineDetails row={row} actions={actions} /></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Phones: one card per employee. */}
      <div className="space-y-2 md:hidden">
        {rows.map((row) => {
          const expanded = open.has(row.employeeId);
          return (
            <div key={row.employeeId} className="rounded-lg border bg-card p-3">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                aria-expanded={expanded}
                onClick={() => toggle(row.employeeId)}
              >
                <span>
                  <span className="block font-medium">{row.employeeName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.daysWorked} of {row.workingDays} days · {row.jobRoleName}
                  </span>
                </span>
                <span className={cn('font-semibold tabular-nums', row.netPay < 0 && 'text-destructive')}>{peso(row.netPay)}</span>
              </button>
              <div className="mt-1 flex flex-wrap gap-1"><WarningBadges row={row} /></div>
              {expanded && <div className="mt-3 border-t pt-3"><LineDetails row={row} actions={actions} /></div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
