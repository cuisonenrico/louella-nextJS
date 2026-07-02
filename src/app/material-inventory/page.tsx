'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Pencil, Settings2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { materialInventoryApi, materialsApi, suppliersApi } from '@/lib/apiServices';
import type { Material, MaterialInventory, Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SheetInput } from '@/components/sheet/SheetInput';
import { useSheetNavigation } from '@/components/sheet/useSheetNavigation';
import { useSaveShortcut } from '@/components/sheet/useSaveShortcut';
import SheetPendingBar from '@/components/sheet/SheetPendingBar';
import { SHEET_CELL, SHEET_CONTAINER, SHEET_HEAD, SHEET_TABLE } from '@/components/sheet/styles';
import { toast } from 'sonner';
import { AdjustmentsDialog } from './components/AdjustmentsDialog';
import { StockCardDialog } from './components/StockCardDialog';
import { BulkSetDialog } from './components/BulkSetDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { extractError } from '@/lib/errors';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }

// ── Main Page ──
export default function MaterialInventoryPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(todayStr());
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [bulkSetOpen, setBulkSetOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<MaterialInventory | null>(null);
  const [adjRecord, setAdjRecord] = useState<MaterialInventory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const { data: materials = [] } = useQuery<Material[]>({ queryKey: ['materials'], queryFn: () => materialsApi.list().then((r) => r.data) });
  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ['suppliers'], queryFn: () => suppliersApi.list().then((r) => r.data) });
  const { data: rows = [], isLoading } = useQuery<MaterialInventory[]>({
    queryKey: ['material-inventory', filterDate],
    queryFn: () => materialInventoryApi.byDate(filterDate).then((r) => r.data),
    enabled: !!filterDate,
  });

  const initMutation = useMutation({
    mutationFn: () => materialInventoryApi.initDate(filterDate).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  // Auto-initialize when the date has no records yet
  useEffect(() => {
    if (!isLoading && rows.length === 0 && materials.length > 0 && !initMutation.isPending) {
      initMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, rows.length, materials.length]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => materialInventoryApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] }); toast.success('Record deleted'); },
    onError: (e) => toast.error(extractError(e)),
  });

  // Inline delivery edits, batched like the other sheets. Reset when the date
  // changes — render-time state adjustment, not an effect.
  const [pendingDeliveries, setPendingDeliveries] = useState<Map<number, number>>(new Map());
  const [pendingDate, setPendingDate] = useState(filterDate);
  if (pendingDate !== filterDate) {
    setPendingDate(filterDate);
    setPendingDeliveries(new Map());
  }

  const effectiveDelivery = useCallback(
    (r: MaterialInventory) => pendingDeliveries.get(r.id) ?? r.delivery,
    [pendingDeliveries],
  );

  const handleDeliveryChange = useCallback((recordId: number, value: number) => {
    setPendingDeliveries((prev) => {
      const next = new Map(prev);
      next.set(recordId, value);
      return next;
    });
  }, []);

  const savePendingMutation = useMutation({
    mutationFn: () =>
      Promise.all(
        Array.from(pendingDeliveries.entries()).map(([id, delivery]) =>
          materialInventoryApi.update(id, { delivery }),
        ),
      ),
    onSuccess: () => {
      setPendingDeliveries(new Map());
      qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] });
      toast.success('Changes saved');
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const discardPending = useCallback(() => {
    setPendingDeliveries(new Map());
    qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] });
  }, [qc, filterDate]);

  // Ctrl+S / Cmd+S saves pending edits, matching the Excel workflow the sheet emulates.
  useSaveShortcut(pendingDeliveries.size > 0 && !savePendingMutation.isPending, () => savePendingMutation.mutate());

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const getInputId = useCallback((id: number, col: 'delivery') => `material-input-${id}-${col}`, []);
  const { moveInColumn, moveLinear } = useSheetNavigation(rowIds, ['delivery'] as const, getInputId);

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    let totalClosingCost = 0;
    let totalCostUsed = 0;
    for (const r of rows) {
      const price = r.material?.pricePerUnit ?? materials.find((m) => m.id === r.materialId)?.pricePerUnit ?? 0;
      totalClosingCost += Math.max(0, r.quantity + effectiveDelivery(r) - r.used) * Number(price);
      totalCostUsed += r.used * Number(price);
    }
    return { totalClosingCost, totalCostUsed };
  }, [rows, materials, effectiveDelivery]);

  return (
    <AuthGuard>
      <AppLayout title="Material Inventory">
        <TooltipProvider>
          {/* Date navigation */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFilterDate(addDays(filterDate, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-[160px] h-8" />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFilterDate(addDays(filterDate, 1))} disabled={filterDate >= todayStr()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {filterDate !== todayStr() && (
              <Button size="sm" variant="outline" onClick={() => setFilterDate(todayStr())}>Today</Button>
            )}
            <div className="flex-grow" />
            <Button size="sm" variant="outline" onClick={() => setBulkSetOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Set
            </Button>
            <Button size="sm" onClick={() => { setEditRecord(null); setStockDialogOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                { label: 'CLOSING INVENTORY VALUE', value: `₱${fmt(summary.totalClosingCost)}`, color: 'text-primary' },
                { label: 'TOTAL COST USED', value: `₱${fmt(summary.totalCostUsed)}`, color: 'text-green-600' },
              ].map(({ label, value, color }) => (
                <Card key={label} className="shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground tracking-wider">{label}</p>
                    <p className={`text-xl font-bold ${color} mt-0.5`}>{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <SheetPendingBar
            totalPending={pendingDeliveries.size}
            isSaving={savePendingMutation.isPending}
            onDiscard={discardPending}
            onSave={() => savePendingMutation.mutate()}
          />

          {/* Sheet */}
          {isLoading || initMutation.isPending ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="flex justify-center py-12 text-muted-foreground">No materials for this date.</div>
          ) : (
            <Table containerClassName={SHEET_CONTAINER} className={SHEET_TABLE}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(SHEET_HEAD, 'text-left min-w-[130px]')}>Material</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-left w-[60px]')}>Unit</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Price/Unit</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-right w-[80px]')}>Opening</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Delivery</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-center w-[70px]')}>Used</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-right w-[80px]')}>Closing</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Cost Used</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'text-right w-[110px]')}>Closing Cost</TableHead>
                  <TableHead className={cn(SHEET_HEAD, 'w-[90px]')}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const price = Number(r.material?.pricePerUnit ?? materials.find((m) => m.id === r.materialId)?.pricePerUnit ?? 0);
                  const delivery = effectiveDelivery(r);
                  const closing = Math.max(0, r.quantity + delivery - r.used);
                  const costUsed = r.used * price;
                  const closingCost = closing * price;
                  const hasPending = pendingDeliveries.has(r.id);

                  return (
                    <TableRow key={r.id} className={hasPending ? 'bg-amber-50/50' : ''}>
                      <TableCell className={cn(SHEET_CELL, 'px-2 font-medium')}>{r.material?.name ?? `#${r.materialId}`}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2')}><Badge variant="secondary" className="text-xs">{r.material?.unit ?? ''}</Badge></TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums text-muted-foreground')}>₱{fmt(price)}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums text-muted-foreground')}>{fmt(r.quantity)}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'p-0')}>
                        <SheetInput
                          id={getInputId(r.id, 'delivery')}
                          value={delivery}
                          decimal
                          onValueChange={(v) => handleDeliveryChange(r.id, v)}
                          onColumnMove={(dir) => moveInColumn(r.id, 'delivery', dir)}
                          onLinearMove={(dir) => moveLinear(getInputId(r.id, 'delivery'), dir)}
                        />
                      </TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-center')}>
                        <Badge variant={r.used > 0 ? 'default' : 'secondary'} className={r.used > 0 ? 'bg-green-500 min-w-[36px]' : 'min-w-[36px]'}>
                          {fmt(r.used)}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums font-bold')}>{fmt(closing)}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums font-semibold text-green-600')}>₱{fmt(costUsed)}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-right tabular-nums font-semibold text-primary')}>₱{fmt(closingCost)}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-1')}>
                        <div className="flex gap-0.5">
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRecord(r); setStockDialogOpen(true); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdjRecord(r)}>
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Adjustments</TooltipContent></Tooltip>
                          <Tooltip><TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(r.id)} disabled={deleteMutation.isPending}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <StockCardDialog
            open={stockDialogOpen}
            editRecord={editRecord}
            filterDate={filterDate}
            materials={materials}
            suppliers={suppliers}
            rows={rows}
            onClose={() => setStockDialogOpen(false)}
            onSaved={() => qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] })}
          />
          <BulkSetDialog
            open={bulkSetOpen}
            filterDate={filterDate}
            materials={materials}
            existingRows={rows}
            onClose={() => setBulkSetOpen(false)}
            onSaved={() => qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] })}
          />
          <AdjustmentsDialog record={adjRecord} onClose={() => setAdjRecord(null)} />

          <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete material stock record?</AlertDialogTitle>
                <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { if (deleteTarget !== null) { deleteMutation.mutate(deleteTarget); setDeleteTarget(null); } }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TooltipProvider>
      </AppLayout>
    </AuthGuard>
  );
}
