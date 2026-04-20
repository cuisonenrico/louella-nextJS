'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { inventoryApi, inventoryAdjustmentsApi, branchesApi } from '@/lib/apiServices';
import type { Branch, Inventory, InventoryAdjustment, AdjustmentType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ADJ_TYPES: AdjustmentType[] = ['PULL_IN', 'PULL_OUT', 'ANOMALY'];

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function InventoryAdjustmentsPage() {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(today);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<Inventory | null>(null);
  const [adjType, setAdjType] = useState<AdjustmentType>('PULL_IN');
  const [adjValue, setAdjValue] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [formError, setFormError] = useState('');

  // local cache for adjustments per inventory
  const [adjCache, setAdjCache] = useState<Record<number, InventoryAdjustment[]>>({});

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const bid = branchId ? parseInt(branchId) : (branches.length > 0 ? branches[0].id : 0);

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['inv-adj', bid, date],
    queryFn: () => inventoryApi.byBranchDate(bid, date).then((r) => r.data),
    enabled: bid > 0,
  });

  const createAdjMut = useMutation({
    mutationFn: (data: { inventoryId: number; type: AdjustmentType; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inv-adj'] });
      setDialogOpen(false);
      if (dialogTarget) {
        setAdjCache((prev) => { const n = { ...prev }; delete n[dialogTarget.id]; return n; });
      }
    },
    onError: (err) => setFormError(extractError(err)),
  });

  const toggleExpand = async (inv: Inventory) => {
    if (expandedId === inv.id) { setExpandedId(null); return; }
    setExpandedId(inv.id);
    if (!adjCache[inv.id]) {
      try {
        const res = await inventoryAdjustmentsApi.listByInventory(inv.id);
        setAdjCache((prev) => ({ ...prev, [inv.id]: res.data }));
      } catch { /* ignore */ }
    }
  };

  const openAdjDialog = (inv: Inventory) => {
    setDialogTarget(inv); setAdjType('PULL_IN'); setAdjValue(''); setAdjNotes(''); setFormError(''); setDialogOpen(true);
  };

  const handleCreateAdj = () => {
    setFormError('');
    const val = parseFloat(adjValue);
    if (!dialogTarget || isNaN(val) || val <= 0) { setFormError('Enter a positive value'); return; }
    createAdjMut.mutate({ inventoryId: dialogTarget.id, type: adjType, value: val, notes: adjNotes || undefined });
  };

  return (
    <AuthGuard>
      <AppLayout title="Inventory Adjustments">
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1">
            <Label className="text-xs">Branch</Label>
            <Select value={branchId || (branches.length > 0 ? String(branches[0].id) : '')} onValueChange={setBranchId}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" /></div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Delivery</TableHead>
                <TableHead className="text-right">Leftover</TableHead>
                <TableHead className="text-right">Reject</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : inventory.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No inventory for this date.</TableCell></TableRow>
              ) : inventory.map((inv: Inventory) => {
                const isOpen = expandedId === inv.id;
                const adjs = adjCache[inv.id] ?? inv.adjustments ?? [];
                return (
                  <>{/* This fragment allows expanding rows */}
                    <TableRow key={inv.id} className="cursor-pointer" onClick={() => toggleExpand(inv)}>
                      <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-medium">{inv.product?.name ?? `#${inv.productId}`}</TableCell>
                      <TableCell className="text-right">{inv.quantity}</TableCell>
                      <TableCell className="text-right">{inv.delivery}</TableCell>
                      <TableCell className="text-right">{inv.leftover}</TableCell>
                      <TableCell className="text-right">{inv.reject}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" onClick={() => openAdjDialog(inv)}><Plus className="mr-1 h-3 w-3" />Adjust</Button>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${inv.id}-adj`}>
                        <TableCell colSpan={7} className="bg-muted/50 p-4">
                          {adjs.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No adjustments.</p>
                          ) : (
                            <Table>
                              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Notes</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {adjs.map((a: InventoryAdjustment) => (
                                  <TableRow key={a.id}>
                                    <TableCell><Badge variant={a.type === 'PULL_IN' ? 'default' : a.type === 'PULL_OUT' ? 'destructive' : 'secondary'}>{a.type}</Badge></TableCell>
                                    <TableCell className="text-right">{a.value}</TableCell>
                                    <TableCell className="text-muted-foreground">{a.notes ?? '—'}</TableCell>
                                    <TableCell>{dayjs(a.createdAt).format('MMM D, HH:mm')}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>

        {/* New Adjustment Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>New Adjustment</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <p className="text-sm text-muted-foreground">Product: <strong>{dialogTarget?.product?.name}</strong></p>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={adjType} onValueChange={(v) => setAdjType(v as AdjustmentType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ADJ_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Value</Label><Input type="number" value={adjValue} onChange={(e) => setAdjValue(e.target.value)} autoFocus /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateAdj} disabled={createAdjMut.isPending}>{createAdjMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppLayout>
    </AuthGuard>
  );
}
