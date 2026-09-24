'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { employeesApi } from '@/lib/apiServices';
import type { Employee, RecurringDeduction } from '@/types';
import { extractError } from '@/lib/errors';
import { peso } from '@/lib/payroll/format';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MONEY = /^\d+(\.\d{1,2})?$/;
const PRESETS = ['SSS', 'PhilHealth', 'Pag-IBIG'];

interface Form { name: string; employeeShare: string; employerShare: string }
const EMPTY: Form = { name: '', employeeShare: '', employerShare: '0' };

export function DeductionsTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<RecurringDeduction | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState('');

  const { data: deductions = [] } = useQuery({
    queryKey: ['employee', employee.id, 'deductions'],
    queryFn: () => employeesApi.deductions(employee.id).then((r) => r.data),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['employee', employee.id, 'deductions'] });
    qc.invalidateQueries({ queryKey: ['payroll'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const data = {
        name: form.name.trim(),
        employeeShare: Number(form.employeeShare),
        employerShare: Number(form.employerShare || 0),
      };
      return editing === null || editing === 'new'
        ? employeesApi.addDeduction(employee.id, data)
        : employeesApi.updateDeduction(employee.id, editing.id, data);
    },
    onSuccess: () => { setEditing(null); refresh(); toast.success('Deduction saved'); },
    onError: (err) => setError(extractError(err)),
  });
  const toggle = useMutation({
    mutationFn: (d: RecurringDeduction) => employeesApi.updateDeduction(employee.id, d.id, { isActive: !d.isActive }),
    onSuccess: refresh,
    onError: (err) => toast.error(extractError(err)),
  });

  const open = (d?: RecurringDeduction) => {
    setForm(d ? { name: d.name, employeeShare: String(d.employeeShare), employerShare: String(d.employerShare) } : EMPTY);
    setError('');
    setEditing(d ?? 'new');
  };
  const submit = () => {
    if (!form.name.trim()) return setError('Name the deduction');
    if (!MONEY.test(form.employeeShare)) return setError('Enter the employee share, at most two decimals');
    if (form.employerShare && !MONEY.test(form.employerShare)) return setError('Enter the employer share, at most two decimals');
    setError('');
    save.mutate();
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Monthly amounts, taken in full on the 1–15 cutoff.</p>
        <Button size="sm" onClick={() => open()}><Plus className="mr-1 h-4 w-4" />Add deduction</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Employee share</TableHead>
            <TableHead className="text-right">Employer share</TableHead>
            <TableHead>Active</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {deductions.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No recurring deductions.</TableCell></TableRow>
          ) : (
            deductions.map((d) => (
              <TableRow key={d.id}>
                <TableCell className={d.isActive ? 'font-medium' : 'text-muted-foreground'}>{d.name}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(d.employeeShare)}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(d.employerShare)}</TableCell>
                <TableCell>
                  <Switch checked={d.isActive} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(d)} aria-label={`${d.name} active`} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${d.name}`} onClick={() => open(d)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing === 'new' ? 'New recurring deduction' : 'Edit recurring deduction'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="deduction-name">Name</Label>
              <Input id="deduction-name" list="deduction-presets" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <datalist id="deduction-presets">{PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-share">Employee share / month (₱)</Label>
                <Input id="employee-share" inputMode="decimal" value={form.employeeShare} onChange={(e) => setForm((f) => ({ ...f, employeeShare: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employer-share">Employer share / month (₱)</Label>
                <Input id="employer-share" inputMode="decimal" value={form.employerShare} onChange={(e) => setForm((f) => ({ ...f, employerShare: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
