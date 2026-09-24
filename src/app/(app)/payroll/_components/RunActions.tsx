'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { payrollApi } from '@/lib/apiServices';
import type { PayrollRun } from '@/types';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function RunActions({ run }: { run: PayrollRun }) {
  const qc = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });

  const paid = useMutation({
    mutationFn: () => payrollApi.markPaid(run.id),
    onSuccess: () => { refresh(); toast.success('Marked as paid'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const voidRun = useMutation({
    mutationFn: () => payrollApi.voidRun(run.id, reason.trim()),
    onSuccess: () => {
      setVoiding(false);
      setReason('');
      refresh();
      toast.success('Run voided — the cutoff is open again');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <Link href={`/payroll/runs/${run.id}/print`}><Printer className="mr-2 h-4 w-4" />Print payslips</Link>
      </Button>
      {run.status === 'FINALIZED' && (
        <Button onClick={() => paid.mutate()} disabled={paid.isPending}>Mark as paid</Button>
      )}
      <Button variant="destructive" onClick={() => setVoiding(true)}>Void run</Button>

      <Dialog open={voiding} onOpenChange={setVoiding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Void this payroll run?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            The run and its payslips stay on record, marked voided. The cutoff reopens so you can correct it and
            finalize again.
          </p>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!reason.trim() || voidRun.isPending} onClick={() => voidRun.mutate()}>
              Void run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
