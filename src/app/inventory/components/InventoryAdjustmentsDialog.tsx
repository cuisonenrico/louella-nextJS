'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { inventoryAdjustmentsApi, inventoryApi } from '@/lib/apiServices';
import type { AdjustmentType, Branch, Inventory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

const ADJ_TYPE_LABELS: Record<AdjustmentType, string> = {
  PULL_IN: 'Pull In',
  PULL_OUT: 'Pull Out',
  ANOMALY: 'Anomaly',
};

const ADJ_COLORS: Record<AdjustmentType, string> = {
  PULL_IN: 'bg-green-100 text-green-800 border-green-300',
  PULL_OUT: 'bg-amber-100 text-amber-800 border-amber-300',
  ANOMALY: 'bg-red-100 text-red-800 border-red-300',
};

interface InventoryAdjustmentsDialogProps {
  inventory: Inventory | null;
  productName: string;
  branches: Branch[];
  onClose: () => void;
}

export default function InventoryAdjustmentsDialog({ inventory, productName, branches, onClose }: InventoryAdjustmentsDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ type: AdjustmentType; value: string; notes: string; toBranchId: string }>({
    type: 'PULL_IN',
    value: '',
    notes: '',
    toBranchId: '',
  });
  const [formError, setFormError] = useState('');

  if (!inventory) return null;

  const currentAdjustments = inventory.adjustments ?? [];
  const adjSum = currentAdjustments.reduce((acc, a) => acc + a.value, 0);

  const destInventoryQuery = useQuery<Inventory[]>({
    queryKey: ['inventory-dest', form.toBranchId, inventory.productId, inventory.date],
    queryFn: () =>
      inventoryApi
        .byBranchDate(parseInt(form.toBranchId), inventory.date.slice(0, 10))
        .then((r) => r.data as Inventory[]),
    enabled: form.type === 'PULL_OUT' && !!form.toBranchId,
  });
  const destInventory = destInventoryQuery.data?.find((r) => r.productId === inventory.productId) ?? null;

  const createMutation = useMutation({
    mutationFn: (data: { inventoryId: number; type: AdjustmentType; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setForm((f) => ({ ...f, value: '', notes: '', toBranchId: '' }));
      setFormError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to add adjustment.'));
    },
  });

  const transferMutation = useMutation({
    mutationFn: (data: { fromInventoryId: number; toInventoryId: number; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.transfer(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setForm((f) => ({ ...f, value: '', notes: '', toBranchId: '' }));
      setFormError('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Transfer failed.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inventoryAdjustmentsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });

  const isPending = createMutation.isPending || transferMutation.isPending;
  const isTransfer = form.type === 'PULL_OUT' && !!form.toBranchId;

  const handleAdd = () => {
    setFormError('');
    const parsedValue = parseInt(form.value, 10);
    if (!form.value.trim() || isNaN(parsedValue) || parsedValue <= 0) {
      setFormError('Please enter a positive integer value.');
      return;
    }
    if (isTransfer) {
      if (!destInventory) {
        setFormError(
          `${branches.find((b) => b.id === parseInt(form.toBranchId))?.name ?? 'Destination branch'} has no inventory record for ${productName} on ${inventory.date.slice(0, 10)}. Create it first.`,
        );
        return;
      }
      transferMutation.mutate({
        fromInventoryId: inventory.id,
        toInventoryId: destInventory.id,
        value: parsedValue,
        notes: form.notes || undefined,
      });
    } else {
      createMutation.mutate({
        inventoryId: inventory.id,
        type: form.type,
        value: parsedValue,
        notes: form.notes || undefined,
      });
    }
  };

  const otherBranches = branches.filter((b) => b.id !== inventory.branchId && b.isActive);

  return (
    <Dialog open={!!inventory} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Adjustments — {productName}</DialogTitle>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold ${adjSum > 0 ? 'bg-green-500 text-white' : adjSum < 0 ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'}`}>
              {adjSum > 0 ? `+${adjSum}` : adjSum}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {currentAdjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1">No adjustments yet.</p>
          ) : (
            <div className="space-y-1">
              {currentAdjustments.map((adj) => (
                <div key={adj.id} className="flex items-center gap-2 py-1.5 border-b">
                  <Badge variant="outline" className={ADJ_COLORS[adj.type]} >{ADJ_TYPE_LABELS[adj.type]}</Badge>
                  <span className={`text-sm font-bold min-w-[40px] ${adj.value > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {adj.value > 0 ? `+${adj.value}` : adj.value}
                  </span>
                  <span className="text-sm text-muted-foreground flex-grow">{adj.notes ?? '—'}</span>
                  {adj.linkedAdjustmentId && <Badge variant="outline" className="text-xs">Transfer</Badge>}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(adj.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Separator />

          <p className="text-sm font-bold">Add Adjustment</p>
          {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as AdjustmentType, toBranchId: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PULL_IN">Pull In — Add stock</SelectItem>
                  <SelectItem value="PULL_OUT">Pull Out — Remove stock</SelectItem>
                  <SelectItem value="ANOMALY">Anomaly — Unexplained variance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === 'PULL_OUT' && (
              <div className="space-y-1">
                <Label className="text-xs">Transfer to Branch (optional)</Label>
                <Select value={form.toBranchId} onValueChange={(v) => setForm((f) => ({ ...f, toBranchId: v }))}>
                  <SelectTrigger><SelectValue placeholder="— Standalone pull-out —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— Standalone pull-out (no transfer) —</SelectItem>
                    {otherBranches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isTransfer && (
              destInventoryQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking destination…
                </div>
              ) : destInventory ? (
                <Alert><AlertDescription>Destination found — current stock: {destInventory.quantity + destInventory.delivery} pcs</AlertDescription></Alert>
              ) : (
                <Alert variant="destructive"><AlertDescription>Destination branch has no inventory record for {productName} on this date.</AlertDescription></Alert>
              )
            )}

            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <Input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} min={1} step={1} placeholder={isTransfer ? 'Units to move' : 'Positive integer'} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleAdd} disabled={isPending || (isTransfer && !destInventory)}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            {isTransfer ? 'Transfer' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
