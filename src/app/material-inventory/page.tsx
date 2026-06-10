'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { toast } from 'sonner';
import { AdjustmentsDialog } from './components/AdjustmentsDialog';
import { StockCardDialog } from './components/StockCardDialog';
import { BulkSetDialog } from './components/BulkSetDialog';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

// ── Main Page ──
export default function MaterialInventoryPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(todayStr());
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [bulkSetOpen, setBulkSetOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<MaterialInventory | null>(null);
  const [adjRecord, setAdjRecord] = useState<MaterialInventory | null>(null);

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

  const summary = useMemo(() => {
    if (rows.length === 0) return null;
    let totalClosingCost = 0;
    let totalCostUsed = 0;
    for (const r of rows) {
      const price = r.material?.pricePerUnit ?? materials.find((m) => m.id === r.materialId)?.pricePerUnit ?? 0;
      totalClosingCost += Math.max(0, r.quantity + r.delivery - r.used) * Number(price);
      totalCostUsed += r.used * Number(price);
    }
    return { totalClosingCost, totalCostUsed };
  }, [rows, materials]);

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

          {/* Grid */}
          {isLoading || initMutation.isPending ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="flex justify-center py-12 text-muted-foreground">No materials for this date.</div>
          ) : (
            <Card className="shadow-none overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="min-w-[130px]">Material</TableHead>
                    <TableHead className="w-[60px]">Unit</TableHead>
                    <TableHead className="text-right w-[90px]">Price/Unit</TableHead>
                    <TableHead className="text-center w-[80px]">Opening</TableHead>
                    <TableHead className="text-center w-[80px]">Delivery</TableHead>
                    <TableHead className="text-center w-[70px]">Used</TableHead>
                    <TableHead className="text-center w-[80px]">Closing</TableHead>
                    <TableHead className="text-right w-[100px]">Cost Used</TableHead>
                    <TableHead className="text-right w-[110px]">Closing Cost</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const price = Number(r.material?.pricePerUnit ?? materials.find((m) => m.id === r.materialId)?.pricePerUnit ?? 0);
                    const closing = Math.max(0, r.quantity + r.delivery - r.used);
                    const costUsed = r.used * price;
                    const closingCost = closing * price;

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.material?.name ?? `#${r.materialId}`}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{r.material?.unit ?? ''}</Badge></TableCell>
                        <TableCell className="text-right text-muted-foreground">₱{fmt(price)}</TableCell>
                        <TableCell className="text-center">{fmt(r.quantity)}</TableCell>
                        <TableCell className="text-center">{fmt(r.delivery)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={r.used > 0 ? 'default' : 'secondary'} className={r.used > 0 ? 'bg-green-500 min-w-[36px]' : 'min-w-[36px]'}>
                            {fmt(r.used)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold">{fmt(closing)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">₱{fmt(costUsed)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">₱{fmt(closingCost)}</TableCell>
                        <TableCell>
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
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(r.id)} disabled={deleteMutation.isPending}>
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
            </Card>
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
        </TooltipProvider>
      </AppLayout>
    </AuthGuard>
  );
}
