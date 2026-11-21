'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { companiesApi, employeesApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const NONE = 'none';

/** Put the selected employees under one company (or none). Past payslips keep theirs. */
export function AssignCompanyDialog({
  employeeIds,
  onOpenChange,
  onAssigned,
}: {
  employeeIds: number[];
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState('');
  const { data: companies = [] } = useQuery({ queryKey: ['companies'], queryFn: () => companiesApi.list().then((r) => r.data) });

  const assign = useMutation({
    mutationFn: () => employeesApi.assignCompany(employeeIds, companyId === NONE ? null : Number(companyId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employee'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success(`Company set for ${employeeIds.length} employee${employeeIds.length === 1 ? '' : 's'}`);
      onAssigned();
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const n = employeeIds.length;
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign company</DialogTitle>
          <DialogDescription>
            {n} employee{n === 1 ? '' : 's'} selected. Payroll runs already finalized keep the company they were finalized under.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Company</Label>
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger aria-label="Company to assign"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              <SelectItem value={NONE}>Not assigned</SelectItem>
            </SelectContent>
          </Select>
          {companies.length === 0 && (
            <p className="text-xs text-muted-foreground">No companies yet. Add them from the Companies button first.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!companyId || assign.isPending} onClick={() => assign.mutate()}>
            {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
