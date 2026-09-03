'use client';

import React, { useState } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ChevronDown, ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { inventoryApi, inventoryAdjustmentsApi, branchesApi } from '@/lib/apiServices';
import type { Branch, Inventory, InventoryAdjustment, AdjustmentType } from '@/types';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import QueryError from '@/components/QueryError';
import { TableRowsSkeleton } from '@/components/loading/Skeletons';

const ADJ_TYPES: AdjustmentType[] = ['PULL_IN', 'PULL_OUT', 'ANOMALY'];

export default function InventoryAdjustmentsPage() {
  usePageHeader({ title: 'Inventory Adjustments' });
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
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<InventoryAdjustment | null>(null);

  const { data: branches = [] } = useQuery({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const bid = branchId ? parseInt(branchId) : (branches.length > 0 ? branches[0].id : 0);

  const { data: inventory = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inv-adj', bid, date],
    queryFn: () => inventoryApi.byBranchDate(bid, date).then((r) => r.data),
    enabled: bid > 0,
    placeholderData: keepPreviousData,
  });

  // The expanded row's adjustments. This used to be a hand-rolled cache keyed by
  // inventory id, which drifted from React Query whenever a mutation landed
  // elsewhere; React Query already does the caching and the invalidation.
  const { data: expandedAdjustments = [] } = useQuery<InventoryAdjustment[]>({
    queryKey: ['inv-adj-list', expandedId],
    queryFn: () => inventoryAdjustmentsApi.listByInventory(expandedId!).then((r) => r.data),
    enabled: expandedId !== null,
  });

  const invalidateAdjustments = () => {
    qc.invalidateQueries({ queryKey: ['inv-adj'] });
    qc.invalidateQueries({ queryKey: ['inv-adj-list'] });
  };

  const createAdjMut = useMutation({
    mutationFn: (data: { inventoryId: number; type: AdjustmentType; value: number; notes?: string }) =>
      inventoryAdjustmentsApi.create(data),
    onSuccess: () => {
      invalidateAdjustments();
      setDialogOpen(false);
      toast.success('Adjustment saved');
    },
    onError: (err) => { const text = extractError(err); setFormError(text); toast.error(text); },
  });

  const deleteAdjMut = useMutation({
    mutationFn: (id: number) => inventoryAdjustmentsApi.delete(id),
    onSuccess: () => {
      invalidateAdjustments();
      toast.success('Adjustment deleted');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const toggleExpand = (inv: Inventory) => {
    setExpandedId((current) => (current === inv.id ? null : inv.id));
  };

  const openAdjDialog = (inv: Inventory) => {
    setDialogTarget(inv); setAdjType('PULL_IN'); setAdjValue(''); setAdjNotes(''); setFormError(''); setDialogOpen(true);
  };

  const handleCreateAdj = () => {
    setFormError('');
    // Whole units only — the API rejects a decimal with a 400, so catch it here
    // where the message can say why.
    const val = parseInt(adjValue, 10);
    if (!dialogTarget || isNaN(val) || val <= 0 || String(val) !== adjValue.trim()) {
      setFormError('Enter a positive whole number of units');
      return;
    }
    createAdjMut.mutate({ inventoryId: dialogTarget.id, type: adjType, value: val, notes: adjNotes || undefined });
  };

  const visibleInventory = search.trim()
    ? inventory.filter((inv: Inventory) =>
        (inv.product?.name ?? '').toLowerCase().includes(search.trim().toLowerCase()))
    : inventory;

  return (
    <>
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="branch">Branch</Label>
            <Select value={branchId || (branches.length > 0 ? String(branches[0].id) : '')} onValueChange={setBranchId}>
              <SelectTrigger id="branch" className="w-48"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map((b: Branch) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="date">Date</Label>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-11 md:size-8" onClick={() => setDate(dayjs(date).subtract(1, 'day').format('YYYY-MM-DD'))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40 h-11 md:h-8" />
              <Button variant="ghost" size="icon" className="size-11 md:size-8" onClick={() => setDate(dayjs(date).add(1, 'day').format('YYYY-MM-DD'))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {date !== today && (
                <Button size="sm" variant="outline" onClick={() => setDate(today)}>Today</Button>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="product">Product</Label>
            <Input id="product"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-56 h-11 md:h-8"
            />
          </div>
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
                <TableRowsSkeleton rows={6} columns={7} />
              ) : isError ? (
                <TableRow><TableCell colSpan={7} className="p-0"><QueryError error={error} onRetry={() => refetch()} /></TableCell></TableRow>
              ) : visibleInventory.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {inventory.length === 0 ? 'No inventory for this date.' : `No products match “${search}”.`}
                </TableCell></TableRow>
              ) : visibleInventory.map((inv: Inventory) => {
                const isOpen = expandedId === inv.id;
                // Collapsed rows use what the inventory payload already carries,
                // so the count is visible without expanding all 169 products.
                const adjs = isOpen ? expandedAdjustments : (inv.adjustments ?? []);
                const adjCount = (inv.adjustments ?? []).length;
                return (
                  <React.Fragment key={inv.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpand(inv)}>
                      <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {inv.product?.name ?? `#${inv.productId}`}
                          {adjCount > 0 && (
                            <Badge variant="secondary" className="text-xs">{adjCount}</Badge>
                          )}
                        </span>
                      </TableCell>
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
                              <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Notes</TableHead><TableHead>Date</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                              <TableBody>
                                {adjs.map((a: InventoryAdjustment) => (
                                  <TableRow key={a.id}>
                                    <TableCell><Badge variant={a.type === 'PULL_IN' ? 'default' : a.type === 'PULL_OUT' ? 'destructive' : 'secondary'}>{a.type}</Badge></TableCell>
                                    {/* Values are stored positive; the type carries the direction. */}
                                    <TableCell className={`text-right tabular-nums font-semibold ${a.type === 'PULL_IN' ? 'text-green-600' : 'text-red-600'}`}>
                                      {a.type === 'PULL_IN' ? `+${a.value}` : `-${a.value}`}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{a.notes ?? '—'}</TableCell>
                                    <TableCell>{dayjs(a.createdAt).format('MMM D, HH:mm')}</TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        disabled={deleteAdjMut.isPending}
                                        onClick={() => setDeleteTarget(a)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
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
                <Label htmlFor="type">Type</Label>
                <Select value={adjType} onValueChange={(v) => setAdjType(v as AdjustmentType)}>
                  <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                  <SelectContent>{ADJ_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="value">Value</Label><Input id="value" type="number" min={1} step={1} value={adjValue} onChange={(e) => setAdjValue(e.target.value)} autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateAdj} disabled={createAdjMut.isPending}>{createAdjMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this adjustment?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.linkedAdjustmentId
                  ? 'This is one leg of a branch transfer — both legs will be removed together.'
                  : 'The adjustment will be removed from this product’s day and its sold count recalculated.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteTarget) { deleteAdjMut.mutate(deleteTarget.id); setDeleteTarget(null); } }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
  );
}
