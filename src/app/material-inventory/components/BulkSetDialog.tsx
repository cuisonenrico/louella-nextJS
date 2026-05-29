'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { materialInventoryApi } from '@/lib/apiServices';
import type { Material, MaterialInventory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export function BulkSetDialog({ open, filterDate, materials, existingRows, onClose, onSaved }: {
  open: boolean;
  filterDate: string;
  materials: Material[];
  existingRows: MaterialInventory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deliveries, setDeliveries] = useState<Map<number, string>>(new Map());
  const [err, setErr] = useState('');
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const activeMaterials = useMemo(() => materials.filter((m) => !m.deletedAt), [materials]);

  useEffect(() => {
    if (!open) return;
    const initial = new Map<number, string>();
    activeMaterials.forEach((m) => { initial.set(m.id, '0'); });
    setDeliveries(initial);
    setErr('');
  }, [open, activeMaterials, existingRows]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const ops: Promise<unknown>[] = [];
      deliveries.forEach((deliveryStr, materialId) => {
        const deliveryVal = parseFloat(deliveryStr) || 0;
        const ex = existingRows.find((r) => r.materialId === materialId);
        if (ex) {
          if (deliveryVal > 0) ops.push(materialInventoryApi.update(ex.id, { delivery: ex.delivery + deliveryVal }));
        } else if (deliveryVal > 0) {
          ops.push(materialInventoryApi.create({ materialId, date: filterDate, quantity: 0, delivery: deliveryVal }));
        }
      });
      return Promise.all(ops);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setErr(extractError(e)),
  });

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, materialId: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const idx = activeMaterials.findIndex((m) => m.id === materialId);
    const next = activeMaterials[idx + 1];
    if (!next) return;
    const nextEl = inputRefs.current.get(next.id);
    if (nextEl) { nextEl.focus(); nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }, [activeMaterials]);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>New Delivery Set — {filterDate}</DialogTitle></DialogHeader>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        <div className="overflow-y-auto flex-1 rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="w-[60px]">Unit</TableHead>
                <TableHead className="w-[90px] text-center">Opening</TableHead>
                <TableHead className="w-[130px] text-right">Delivery</TableHead>
                <TableHead className="w-[90px] text-center">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMaterials.map((m) => {
                const ex = existingRows.find((r) => r.materialId === m.id);
                const opening = ex ? ex.quantity : 0;
                const existingDelivery = ex ? ex.delivery : 0;
                const inputVal = parseFloat(deliveries.get(m.id) ?? '0') || 0;
                const used = ex ? ex.used : 0;
                const closing = Math.max(0, opening + existingDelivery + inputVal - used);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{m.unit}</Badge></TableCell>
                    <TableCell className="text-center text-muted-foreground">{opening}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <Input
                          ref={(el) => { if (el) inputRefs.current.set(m.id, el); else inputRefs.current.delete(m.id); }}
                          type="number" min={0} step={0.01} className="h-8 w-24 text-right"
                          value={deliveries.get(m.id) ?? '0'}
                          onChange={(e) => setDeliveries((prev) => { const next = new Map(prev); next.set(m.id, e.target.value); return next; })}
                          onKeyDown={(e) => handleKeyDown(e, m.id)}
                        />
                        {existingDelivery > 0 && (
                          <span className="text-[10px] text-muted-foreground">+{existingDelivery} recorded</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-semibold">{closing}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
