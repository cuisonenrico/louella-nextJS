'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Pencil, Settings2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { materialAdjustmentsApi, materialInventoryApi, materialsApi, suppliersApi } from '@/lib/apiServices';
import type { Material, MaterialAdjustment, MaterialInventory, Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function addDays(dateStr: string, days: number) { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

const ADJ_COLORS: Record<string, string> = { PULL_IN: 'bg-green-100 text-green-800 border-green-300', PULL_OUT: 'bg-amber-100 text-amber-800 border-amber-300', ANOMALY: 'bg-red-100 text-red-800 border-red-300' };

// ── Adjustments Dialog ──
function AdjustmentsDialog({ record, onClose }: { record: MaterialInventory | null; onClose: () => void }) {
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

// ── Stock Card Dialog ──
interface StockForm { materialId: string; date: string; supplierId: string; quantity: string; delivery: string; batchNumber: string; notes: string; }

function StockCardDialog({ open, editRecord, filterDate, materials, suppliers, rows, onClose, onSaved }: {
  open: boolean; editRecord: MaterialInventory | null; filterDate: string; materials: Material[]; suppliers: Supplier[]; rows: MaterialInventory[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<StockForm>({ materialId: '', date: filterDate, supplierId: '', quantity: '0', delivery: '0', batchNumber: '', notes: '' });
  const [err, setErr] = useState('');

  // In New mode, detect an existing stock card for the selected material so delivery can be appended
  const existingRow = useMemo(() => {
    if (editRecord || !form.materialId) return null;
    return rows.find((r) => r.materialId === parseInt(form.materialId)) ?? null;
  }, [editRecord, form.materialId, rows]);

  // When a material is selected in New mode, auto-fill Opening from the existing row
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
        // Edit mode: full replacement
        return materialInventoryApi.update(editRecord.id, { ...meta, quantity: parseFloat(form.quantity) || 0, delivery: addDelivery } as Partial<MaterialInventory>);
      }
      if (existingRow) {
        // Append delivery — never overwrite the existing stock card's recorded amount
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

// ── Bulk Set Dialog ──
function BulkSetDialog({ open, filterDate, materials, existingRows, onClose, onSaved }: {
  open: boolean; filterDate: string; materials: Material[]; existingRows: MaterialInventory[];
  onClose: () => void; onSaved: () => void;
}) {
  // delivery values only — opening is read-only (carry-forward from yesterday via init)
  const [deliveries, setDeliveries] = useState<Map<number, string>>(new Map());
  const [err, setErr] = useState('');
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const activeMaterials = useMemo(() => materials.filter((m) => !m.deletedAt), [materials]);

  useEffect(() => {
    if (!open) return;
    const initial = new Map<number, string>();
    activeMaterials.forEach((m) => {
      initial.set(m.id, '0');
    });
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
          if (deliveryVal > 0) {
            ops.push(materialInventoryApi.update(ex.id, { delivery: ex.delivery + deliveryVal }));
          }
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

// ── Main Page ──
export default function MaterialInventoryPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(todayStr());
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [bulkSetOpen, setBulkSetOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<MaterialInventory | null>(null);
  const [adjRecord, setAdjRecord] = useState<MaterialInventory | null>(null);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackErr, setSnackErr] = useState('');

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
    onError: (e) => { setSnackErr(extractError(e)); setTimeout(() => setSnackErr(''), 4000); },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['material-inventory', filterDate] }),
    onError: (e) => { setSnackErr(extractError(e)); setTimeout(() => setSnackErr(''), 4000); },
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
            <Button size="sm" variant="outline" onClick={() => setFilterDate(todayStr())}>Today</Button>
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
                { label: 'CLOSING INVENTORY VALUE', value: `₱${summary.totalClosingCost.toLocaleString()}`, color: 'text-primary' },
                { label: 'TOTAL COST USED', value: `₱${summary.totalCostUsed.toLocaleString()}`, color: 'text-green-600' },
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
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
                        <TableCell className="text-right text-muted-foreground">₱{price.toLocaleString()}</TableCell>
                        <TableCell className="text-center">{r.quantity}</TableCell>
                        <TableCell className="text-center">{r.delivery}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={r.used > 0 ? 'default' : 'secondary'} className={r.used > 0 ? 'bg-green-500 min-w-[36px]' : 'min-w-[36px]'}>
                            {r.used}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold">{closing}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">₱{costUsed.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">₱{closingCost.toLocaleString()}</TableCell>
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

          {/* Snackbars */}
          {snackMsg && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <Alert className="shadow-lg bg-green-50 border-green-300"><AlertDescription>{snackMsg}</AlertDescription></Alert>
            </div>
          )}
          {snackErr && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <Alert variant="destructive" className="shadow-lg"><AlertDescription>{snackErr}</AlertDescription></Alert>
            </div>
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
