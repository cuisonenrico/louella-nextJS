'use client';

import { useState } from 'react';
import type { CutoffDraft } from '@/types';
import { formatCutoff } from '@/lib/payroll/cutoff';
import { peso } from '@/lib/payroll/format';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function FinalizeBar({ draft, onFinalize, pending }: { draft: CutoffDraft; onFinalize: () => void; pending: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const { employeeCount, netPay, employerShare } = draft.totals;
  const blocked = draft.hasBlocking || draft.payslips.length === 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="space-y-1 text-sm">
        <p>
          {employeeCount} employee{employeeCount === 1 ? '' : 's'} · Net pay <strong>{peso(netPay)}</strong> · Employer share {peso(employerShare)}
        </p>
        {draft.hasBlocking && <p className="text-destructive">Resolve the blocking warnings before finalizing.</p>}
      </div>
      <Button onClick={() => setConfirming(true)} disabled={blocked || pending}>Finalize payroll</Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize {formatCutoff(draft)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {employeeCount} employees, total net pay {peso(netPay)}. The payslips are frozen, and absences and
              adjustments in this cutoff are locked until the run is voided.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirming(false); onFinalize(); }}>Finalize</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
