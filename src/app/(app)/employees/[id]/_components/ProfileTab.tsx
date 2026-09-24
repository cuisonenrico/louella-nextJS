'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { employeesApi } from '@/lib/apiServices';
import type { Employee } from '@/types';
import { extractError } from '@/lib/errors';
import { manilaToday } from '@/lib/manilaDate';
import { peso, restDaysLabel } from '@/lib/payroll/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmployeeFormDialog } from '../../_components/EmployeeFormDialog';

export function ProfileTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [separationDate, setSeparationDate] = useState(() => manilaToday());

  const separation = useMutation({
    mutationFn: (date: string | null) => employeesApi.setSeparation(employee.id, date),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employee.id] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Employment status saved');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const rows: [string, string][] = [
    ['Name', employee.fullName],
    ['Job role', employee.jobRole.name],
    ['Branch', employee.branch?.name ?? 'Central kitchen / unassigned'],
    ['Hired', employee.hiredOn],
    ['Separated', employee.separatedOn ?? '—'],
    ['Rest days', restDaysLabel(employee.restDays)],
    ['Current daily rate', employee.currentDailyRate === null ? '—' : peso(employee.currentDailyRate)],
    ['Phone', employee.phone ?? '—'],
    ['Address', employee.address ?? '—'],
  ];

  return (
    <Card className="space-y-6 p-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="mr-2 h-4 w-4" />Edit details</Button>
        {employee.separatedOn === null ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="separation-date">Last day of work</Label>
              <Input id="separation-date" type="date" className="w-44" value={separationDate} onChange={(e) => setSeparationDate(e.target.value)} />
            </div>
            <Button variant="destructive" disabled={!separationDate || separation.isPending} onClick={() => separation.mutate(separationDate)}>
              Separate
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={separation.isPending} onClick={() => separation.mutate(null)}>Reactivate</Button>
        )}
      </div>
      {editing && <EmployeeFormDialog open onOpenChange={setEditing} employee={employee} />}
    </Card>
  );
}
