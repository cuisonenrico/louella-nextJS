'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { materialInventoryApi } from '@/lib/apiServices';
import type { Material, MaterialInventory, Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

interface StockForm {
  materialId: string;
  date: string;
  supplierId: string;
  quantity: string;
  delivery: string;
  batchNumber: string;
  notes: string;
}

export function StockCardDialog({ open, editRecord, filterDate, materials, suppliers, rows, onClose, onSaved }: {
  open: boolean;
  editRecord: MaterialInventory | null;
  filterDate: string;
  materials: Material[];
  suppliers: Supplier[];
  rows: MaterialInventory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<StockForm>({ materialId: '', date: filterDate, supplierId: '', quantity: '0', delivery: '0', batchNumber: '', notes: '' });
  const [err, setErr] = useState('');

  const existingRow = useMemo(() => {
    if (editRecord || !form.materialId) return null;
    return rows.find((r) => r.materialId === parseInt(form.materialId)) ?? null;
  }, [editRecord, form.materialId, rows]);

  useEffect(() => {
    if (editRecord || !form.materialId) return;
    const ex = rows.find((r) => r.materialId === parseInt(form.materialId));
    if (ex) setForm((prev) => ({ ...prev, quantity: String(ex.quantity) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.materialId]);

  useEffect(() => {
    if (!open) return;
    if (editRecord) {
      setForm({ materialId: String(editRecord.materialId), date: editRecord.date?.slice(0, 10) ?? filterDate, supplierId: editRecord.supplierId ? String(editRecord.supplierId) : '', quantity: String(editRecord.quantity), delivery: String(editRecord.delivery), batchNumber: editRecord.batchNumber ?? '', notes: editRecord.notes ?? '' });
    } else {
      setForm({ materialId: '', date: filterDate, supplierId: '', quantity: '0', delivery: '0', batchNumber: '', notes: '' });
    }
    setErr('');
  }, [open, editRecord, filterDate]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const addDelivery = parseFloat(form.delivery) || 0;
      const meta = {
        supplierId: form.supplierId ? parseInt(form.supplierId) : undefined,
        batchNumber: form.batchNumber || undefined,
        notes: form.notes || undefined,
      };
      if (editRecord) {
        return materialInventoryApi.update(editRecord.id, { ...meta, quantity: parseFloat(form.quantity) || 0, delivery: addDelivery } as Partial<MaterialInventory>);
      }
      if (existingRow) {
        return materialInventoryApi.update(existingRow.id, { ...meta, delivery: existingRow.delivery + addDelivery } as Partial<MaterialInventory>);
      }
      return materialInventoryApi.create({ materialId: parseInt(form.materialId), date: form.date, ...meta, quantity: parseFloat(form.quantity) || 0, delivery: addDelivery } as Partial<MaterialInventory>);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setErr(extractError(e)),
  });

  const set = (field: keyof StockForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editRecord ? 'Edit Stock Card' : 'New Stock Card'}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={set('date')} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Material *</Label>
            <Select value={form.materialId} onValueChange={(v) => setForm((p) => ({ ...p, materialId: v }))} disabled={!!editRecord}>
              <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
              <SelectContent>{materials.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name} ({m.unit})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Supplier</Label>
            <Select value={form.supplierId || '__none__'} onValueChange={(v) => setForm((p) => ({ ...p, supplierId: v === '__none__' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {suppliers.filter((s) => s.isActive).map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Opening Stock</Label>
              <Input type="number" value={form.quantity} onChange={set('quantity')} min={0} step={0.01} disabled={!editRecord && !!existingRow} />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{!editRecord && existingRow ? 'Add Delivery' : 'Delivery'}</Label>
              <Input type="number" value={form.delivery} onChange={set('delivery')} min={0} step={0.01} />
              {!editRecord && existingRow && existingRow.delivery > 0 && (
                <p className="text-[10px] text-muted-foreground">+{existingRow.delivery} already recorded</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1"><Label className="text-xs">Batch Number</Label><Input value={form.batchNumber} onChange={set('batchNumber')} /></div>
            <div className="flex-1 space-y-1"><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={set('notes')} /></div>
          </div>
          {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.materialId || !form.date || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
