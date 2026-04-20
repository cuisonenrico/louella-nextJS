'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, ArrowRightLeft } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { unitConversionsApi } from '@/lib/apiServices';
import type { UnitConversion, MeasurementUnit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UNITS: MeasurementUnit[] = ['KG', 'G', 'LITER', 'ML', 'PIECE', 'DOZEN', 'BAG', 'SACHET', 'CUP', 'TBSP', 'TSP'];

interface ConvForm { fromUnit: MeasurementUnit; toUnit: MeasurementUnit; factor: string; }
const defaultForm: ConvForm = { fromUnit: 'KG', toUnit: 'G', factor: '' };

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function UnitConversionsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UnitConversion | null>(null);
  const [form, setForm] = useState<ConvForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<UnitConversion | null>(null);
  const [formError, setFormError] = useState('');

  // Conversion tool state
  const [convQty, setConvQty] = useState('1');
  const [convFrom, setConvFrom] = useState<MeasurementUnit>('KG');
  const [convTo, setConvTo] = useState<MeasurementUnit>('G');
  const [convResult, setConvResult] = useState<string | null>(null);
  const [convError, setConvError] = useState('');

  const { data: conversions = [], isLoading } = useQuery({ queryKey: ['unit-conversions'], queryFn: () => unitConversionsApi.list().then((r) => r.data) });

  const createMut = useMutation({
    mutationFn: (data: Partial<UnitConversion>) => unitConversionsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['unit-conversions'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, factor }: { id: number; factor: number }) => unitConversionsApi.update(id, factor),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['unit-conversions'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => unitConversionsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['unit-conversions'] }); setDeleteTarget(null); },
  });

  const openCreate = () => { setEditTarget(null); setForm(defaultForm); setFormError(''); setDialogOpen(true); };
  const openEdit = (c: UnitConversion) => {
    setEditTarget(c);
    setForm({ fromUnit: c.fromUnit, toUnit: c.toUnit, factor: String(c.factor) });
    setFormError(''); setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    const factor = parseFloat(form.factor);
    if (isNaN(factor) || factor <= 0) { setFormError('Factor must be a positive number'); return; }
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, factor });
    } else {
      if (form.fromUnit === form.toUnit) { setFormError('Units must be different'); return; }
      createMut.mutate({ fromUnit: form.fromUnit, toUnit: form.toUnit, factor });
    }
  };

  const handleConvert = async () => {
    setConvError(''); setConvResult(null);
    const qty = parseFloat(convQty);
    if (isNaN(qty)) { setConvError('Enter a valid quantity'); return; }
    try {
      const res = await unitConversionsApi.convert(qty, convFrom, convTo);
      setConvResult(String(res.data));
    } catch (err) { setConvError(extractError(err)); }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Unit Conversions">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversion Tool */}
          <Card className="lg:col-span-1">
            <CardHeader><CardTitle className="text-base">Conversion Tool</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label>Quantity</Label><Input type="number" value={convQty} onChange={(e) => setConvQty(e.target.value)} /></div>
              <div className="space-y-1">
                <Label>From</Label>
                <Select value={convFrom} onValueChange={(v) => setConvFrom(v as MeasurementUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>To</Label>
                <Select value={convTo} onValueChange={(v) => setConvTo(v as MeasurementUnit)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleConvert} className="w-full"><ArrowRightLeft className="mr-2 h-4 w-4" />Convert</Button>
              {convResult && <p className="text-center font-semibold text-lg">{convQty} {convFrom} = {convResult} {convTo}</p>}
              {convError && <Alert variant="destructive"><AlertDescription>{convError}</AlertDescription></Alert>}
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="lg:col-span-2">
            <div className="flex justify-between items-center p-4 pb-0">
              <h3 className="font-semibold">Defined Conversions</h3>
              <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Factor</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : conversions.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No conversions defined.</TableCell></TableRow>
                ) : conversions.map((c: UnitConversion) => (
                  <TableRow key={c.id}>
                    <TableCell><Badge variant="outline">{c.fromUnit}</Badge></TableCell>
                    <TableCell><Badge variant="outline">{c.toUnit}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{c.factor}</TableCell>
                    <TableCell className="text-right">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(c)}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>{editTarget ? 'Edit Conversion' : 'New Conversion'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              {!editTarget && (
                <>
                  <div className="space-y-2">
                    <Label>From Unit</Label>
                    <Select value={form.fromUnit} onValueChange={(v) => setForm((f) => ({ ...f, fromUnit: v as MeasurementUnit }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To Unit</Label>
                    <Select value={form.toUnit} onValueChange={(v) => setForm((f) => ({ ...f, toUnit: v as MeasurementUnit }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="space-y-2"><Label>Factor</Label><Input type="number" step="any" value={form.factor} onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))} autoFocus /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete Conversion</AlertDialogTitle><AlertDialogDescription>Delete <strong>{deleteTarget?.fromUnit} → {deleteTarget?.toUnit}</strong>?</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMut.isPending} onClick={() => { if (deleteTarget) deleteMut.mutate(deleteTarget.id); }}>
                {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </AuthGuard>
  );
}
