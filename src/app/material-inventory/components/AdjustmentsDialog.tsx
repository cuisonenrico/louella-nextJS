'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2 } from 'lucide-react';
import { materialAdjustmentsApi } from '@/lib/apiServices';
import type { MaterialAdjustment, MaterialInventory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

const ADJ_COLORS: Record<string, string> = {
  PULL_IN: 'bg-green-100 text-green-800 border-green-300',
  PULL_OUT: 'bg-amber-100 text-amber-800 border-amber-300',
  ANOMALY: 'bg-red-100 text-red-800 border-red-300',
};

export function AdjustmentsDialog({ record, onClose }: { record: MaterialInventory | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<'PULL_IN' | 'PULL_OUT' | 'ANOMALY'>('PULL_OUT');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [formErr, setFormErr] = useState('');

  const adjustments: MaterialAdjustment[] = record?.adjustments ?? [];

  const createAdj = useMutation({
    mutationFn: () => materialAdjustmentsApi.create({ materialInventoryId: record!.id, type, value: parseFloat(value), notes: notes || undefined }),
    onSuccess: () => { setValue(''); setNotes(''); setFormErr(''); qc.invalidateQueries({ queryKey: ['material-inventory'] }); },
    onError: (e) => setFormErr(extractError(e)),
  });

  const deleteAdj = useMutation({
    mutationFn: (id: number) => materialAdjustmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['material-inventory'] }),
    onError: (e) => setFormErr(extractError(e)),
  });

  if (!record) return null;

  return (
    <Dialog open={!!record} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Adjustments — {record.material?.name ?? `ID ${record.materialId}`}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments yet.</p>
          ) : (
            <div className="space-y-1">
              {adjustments.map((adj) => (
                <div key={adj.id} className="flex items-center gap-2 py-1.5 border-b">
                  <Badge variant="outline" className={ADJ_COLORS[adj.type]}>{adj.type}</Badge>
                  <span className="text-sm font-semibold">{adj.value}</span>
                  {adj.notes && <span className="text-sm text-muted-foreground flex-grow">{adj.notes}</span>}
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" disabled={deleteAdj.isPending} onClick={() => deleteAdj.mutate(adj.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Separator />
          <p className="text-sm font-bold">Add Adjustment</p>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="min-w-[120px]">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PULL_IN">Pull In</SelectItem>
                  <SelectItem value="PULL_OUT">Pull Out</SelectItem>
                  <SelectItem value="ANOMALY">Anomaly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-[100px]">
              <Label className="text-xs">Value</Label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} min={0} step={0.01} className="h-8" />
            </div>
            <div className="flex-grow min-w-[120px]">
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8" />
            </div>
            <Button size="sm" disabled={!value || parseFloat(value) <= 0 || createAdj.isPending} onClick={() => createAdj.mutate()}>
              {createAdj.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
          </div>
          {formErr && <Alert variant="destructive"><AlertDescription>{formErr}</AlertDescription></Alert>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
