'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { HolidayType, PayrollHoliday } from '@/types';
import { payrollApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { manilaToday } from '@/lib/manilaDate';
import { isCalendarDate } from '@/lib/payroll/cutoff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TYPE_LABEL: Record<HolidayType, string> = { REGULAR: 'Regular', SPECIAL: 'Special' };

export function HolidaysTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: PayrollHoliday[];
  onEdit: (h: PayrollHoliday) => void;
  onDelete: (h: PayrollHoliday) => void;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No holidays this year.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Bakery</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((h) => (
          <TableRow key={h.id}>
            <TableCell className="tabular-nums">{h.date}</TableCell>
            <TableCell>{h.name}</TableCell>
            <TableCell><Badge variant={h.type === 'REGULAR' ? 'default' : 'secondary'}>{TYPE_LABEL[h.type]}</Badge></TableCell>
            <TableCell>{h.isClosed ? 'Closed' : 'Open'}</TableCell>
            <TableCell className="text-right">
              {h.locked ? (
                <Lock className="ml-auto size-4 text-muted-foreground" aria-label={`${h.name} is in a finalized cutoff`} />
              ) : (
                <span className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${h.name}`} onClick={() => onEdit(h)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Delete ${h.name}`} onClick={() => onDelete(h)}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HolidayDialog({ holiday, onClose }: { holiday: PayrollHoliday | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = holiday !== null;
  const [date, setDate] = useState(holiday?.date ?? manilaToday());
  const [name, setName] = useState(holiday?.name ?? '');
  const [type, setType] = useState<HolidayType>(holiday?.type ?? 'REGULAR');
  const [isClosed, setIsClosed] = useState(holiday?.isClosed ?? false);
  const valid = name.trim() !== '' && isCalendarDate(date);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? payrollApi.updateHoliday(holiday.id, { name: name.trim(), type, isClosed })
        : payrollApi.createHoliday({ date, name: name.trim(), type, isClosed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Holiday saved');
      onClose();
    },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit holiday' : 'Add holiday'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="holiday-date">Date</Label>
            <Input id="holiday-date" type="date" value={date} disabled={editing} onChange={(e) => setDate(e.target.value)} />
            {editing && <p className="text-xs text-muted-foreground">To move a holiday, delete it and add it again.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="holiday-name">Name</Label>
            <Input id="holiday-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as HolidayType)}>
              <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REGULAR">Regular holiday</SelectItem>
                <SelectItem value="SPECIAL">Special holiday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="holiday-closed">Bakery closed this day</Label>
            <Switch id="holiday-closed" checked={isClosed} onCheckedChange={setIsClosed} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HolidaysCard() {
  const qc = useQueryClient();
  const [year, setYear] = useState(() => Number(manilaToday().slice(0, 4)));
  const [dialog, setDialog] = useState<{ holiday: PayrollHoliday | null } | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['payroll', 'holidays', year],
    queryFn: () => payrollApi.holidays(year).then((r) => r.data),
  });
  const remove = useMutation({
    mutationFn: (id: number) => payrollApi.removeHoliday(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll'] }); toast.success('Holiday deleted'); },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">Open by default. Mark a holiday closed only if the bakery did not operate.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="size-4" /></Button>
          <span className="w-12 text-center font-semibold">{year}</span>
          <Button variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear((y) => y + 1)}><ChevronRight className="size-4" /></Button>
          <Button size="sm" onClick={() => setDialog({ holiday: null })}><Plus className="mr-1 size-4" />Add holiday</Button>
        </div>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <HolidaysTable
          rows={rows}
          onEdit={(h) => setDialog({ holiday: h })}
          onDelete={(h) => { if (window.confirm(`Delete ${h.name} (${h.date})?`)) remove.mutate(h.id); }}
        />
      )}
      {dialog && <HolidayDialog holiday={dialog.holiday} onClose={() => setDialog(null)} />}
    </Card>
  );
}
