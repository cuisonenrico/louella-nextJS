'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { branchesApi, employeesApi, jobRolesApi } from '@/lib/apiServices';
import type { Employee } from '@/types';
import { extractError } from '@/lib/errors';
import { manilaToday } from '@/lib/manilaDate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RestDaysPicker } from './RestDaysPicker';

const NO_BRANCH = 'none';
const MONEY = /^\d+(\.\d{1,2})?$/;

interface Form {
  firstName: string;
  lastName: string;
  jobRoleId: string;
  branchId: string;
  hiredOn: string;
  restDays: number[];
  dailyRate: string;
  phone: string;
  address: string;
}

function formFor(employee?: Employee): Form {
  if (!employee) {
    return { firstName: '', lastName: '', jobRoleId: '', branchId: NO_BRANCH, hiredOn: manilaToday(), restDays: [0], dailyRate: '', phone: '', address: '' };
  }
  return {
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobRoleId: String(employee.jobRole.id),
    branchId: employee.branch ? String(employee.branch.id) : NO_BRANCH,
    hiredOn: employee.hiredOn,
    restDays: employee.restDays,
    dailyRate: '',
    phone: employee.phone ?? '',
    address: employee.address ?? '',
  };
}

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(() => formFor(employee));
  const [error, setError] = useState('');
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const { data: roles = [] } = useQuery({ queryKey: ['job-roles'], queryFn: () => jobRolesApi.list().then((r) => r.data) });
  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });

  const save = useMutation({
    mutationFn: () => {
      const base = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        jobRoleId: Number(form.jobRoleId),
        branchId: form.branchId === NO_BRANCH ? null : Number(form.branchId),
        hiredOn: form.hiredOn,
        restDays: form.restDays,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      };
      return employee
        ? employeesApi.update(employee.id, base)
        : employeesApi.create({ ...base, dailyRate: Number(form.dailyRate) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      if (employee) qc.invalidateQueries({ queryKey: ['employee', employee.id] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Employee saved');
      onOpenChange(false);
    },
    onError: (err) => setError(extractError(err)),
  });

  const submit = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('First and last name are required');
    if (!form.jobRoleId) return setError('Choose a job role');
    if (!form.hiredOn) return setError('Enter the hire date');
    if (!employee && !(MONEY.test(form.dailyRate) && Number(form.dailyRate) > 0)) {
      return setError('Enter a daily rate above zero, with at most two decimals');
    }
    setError('');
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? 'Edit employee' : 'New employee'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First name</Label>
              <Input id="first-name" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last name</Label>
              <Input id="last-name" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Job role</Label>
              <Select value={form.jobRoleId} onValueChange={(v) => set('jobRoleId', v)}>
                <SelectTrigger aria-label="Job role"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Branch</Label>
              <Select value={form.branchId} onValueChange={(v) => set('branchId', v)}>
                <SelectTrigger aria-label="Branch"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BRANCH}>Central kitchen / unassigned</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hired-on">Hired on</Label>
              <Input id="hired-on" type="date" value={form.hiredOn} onChange={(e) => set('hiredOn', e.target.value)} />
            </div>
            {!employee && (
              <div className="space-y-2">
                <Label htmlFor="daily-rate">Daily rate (₱)</Label>
                <Input id="daily-rate" inputMode="decimal" value={form.dailyRate} onChange={(e) => set('dailyRate', e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Rest days</Label>
            <RestDaysPicker value={form.restDays} onChange={(days) => set('restDays', days)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
          </div>
          {employee && <p className="text-xs text-muted-foreground">Change the daily rate from the Rates tab, so the history is kept.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
