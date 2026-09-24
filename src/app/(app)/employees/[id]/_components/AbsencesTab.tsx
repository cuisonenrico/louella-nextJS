'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { absencesApi, payrollApi } from '@/lib/apiServices';
import type { Absence, Employee } from '@/types';
import { extractError } from '@/lib/errors';
import { manilaToday } from '@/lib/manilaDate';
import { cutoffOf } from '@/lib/payroll/cutoff';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AbsenceCalendar } from './AbsenceCalendar';

const MONTH_LABEL = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function AbsencesTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => manilaToday().slice(0, 7));
  const from = `${month}-01`;
  const to = cutoffOf(`${month}-16`).periodEnd;
  const year = Number(month.slice(0, 4));

  const { data: absences = [] } = useQuery({
    queryKey: ['employee', employee.id, 'absences', month],
    queryFn: () => absencesApi.list({ from, to, employeeId: employee.id }).then((r) => r.data),
  });
  const { data: cutoffs = [] } = useQuery({
    queryKey: ['payroll', 'cutoffs', year],
    queryFn: () => payrollApi.cutoffs(year).then((r) => r.data),
  });
  const locked = useMemo(
    () => new Set(cutoffs.filter((c) => c.status !== 'OPEN').map((c) => c.periodStart)),
    [cutoffs],
  );

  const toggle = useMutation({
    mutationFn: ({ date, existing }: { date: string; existing: Absence | undefined }) =>
      existing ? absencesApi.remove(existing.id) : absencesApi.create({ employeeId: employee.id, date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee', employee.id, 'absences'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-medium">{MONTH_LABEL.format(new Date(`${from}T00:00:00.000Z`))}</p>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <AbsenceCalendar
        month={month}
        restDays={employee.restDays}
        hiredOn={employee.hiredOn}
        separatedOn={employee.separatedOn}
        absences={absences}
        lockedPeriodStarts={locked}
        onToggle={(date, existing) => toggle.mutate({ date, existing })}
        pending={toggle.isPending}
      />
      <p className="text-xs text-muted-foreground">
        Every working day counts as worked unless it is marked here. Grey days are rest days or outside employment;
        faded days belong to a finalized cutoff.
      </p>
    </Card>
  );
}
