'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { employeesApi } from '@/lib/apiServices';
import type { Employee } from '@/types';
import { extractError } from '@/lib/errors';
import { manilaToday } from '@/lib/manilaDate';
import { peso } from '@/lib/payroll/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const MONEY = /^\d+(\.\d{1,2})?$/;

export function RatesTab({ employee }: { employee: Employee }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [effectiveOn, setEffectiveOn] = useState(() => manilaToday());

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ['employee', employee.id, 'rates'],
    queryFn: () => employeesApi.rates(employee.id).then((r) => r.data),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['employee', employee.id] });
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['payroll'] });
  };
  const add = useMutation({
    mutationFn: () => employeesApi.addRate(employee.id, { dailyRate: Number(amount), effectiveOn }),
    onSuccess: () => { setAmount(''); refresh(); toast.success('Rate added'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const remove = useMutation({
    mutationFn: (rateId: number) => employeesApi.removeRate(employee.id, rateId),
    onSuccess: () => { refresh(); toast.success('Rate removed'); },
    onError: (err) => toast.error(extractError(err)),
  });
  const valid = MONEY.test(amount) && Number(amount) > 0 && effectiveOn !== '';

  return (
    <Card className="space-y-4 p-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valid) add.mutate(); }}>
        <div className="space-y-1">
          <Label htmlFor="new-rate">New daily rate (₱)</Label>
          <Input id="new-rate" inputMode="decimal" className="w-36" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate-effective">Effective from</Label>
          <Input id="rate-effective" type="date" className="w-44" value={effectiveOn} onChange={(e) => setEffectiveOn(e.target.value)} />
        </div>
        <Button type="submit" disabled={!valid || add.isPending}>Add rate</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Effective from</TableHead>
            <TableHead className="text-right">Daily rate</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
          ) : (
            rates.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.effectiveOn}</TableCell>
                <TableCell className="text-right tabular-nums">{peso(r.dailyRate)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove rate from ${r.effectiveOn}`} disabled={remove.isPending} onClick={() => remove.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        A raise is a new rate, not an edit. Rates already used by a finalized payroll cannot be removed or backdated into it.
      </p>
    </Card>
  );
}
