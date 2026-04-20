'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, Search } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { materialsApi, suppliersApi } from '@/lib/apiServices';
import type { Material, MaterialPriceHistory, MeasurementUnit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import dayjs from 'dayjs';

const UNITS: MeasurementUnit[] = ['KG', 'G', 'LITER', 'ML', 'PIECE', 'DOZEN', 'BAG', 'SACHET', 'CUP', 'TBSP', 'TSP'];

interface MaterialForm { name: string; unit: MeasurementUnit; pricePerUnit: string; reorderLevel: string; }
const defaultForm: MaterialForm = { name: '', unit: 'KG', pricePerUnit: '', reorderLevel: '0' };

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function MaterialsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [formError, setFormError] = useState('');

  const { data: materials = [], isLoading } = useQuery({ queryKey: ['materials'], queryFn: () => materialsApi.list().then((r) => r.data) });
  const { data: priceHistory = [] } = useQuery({
    queryKey: ['materialPriceHistory', editTarget?.id],
    queryFn: () => materialsApi.priceHistory(editTarget!.id).then((r) => r.data),
    enabled: !!editTarget,
  });

  const createMut = useMutation({
    mutationFn: (data: Partial<Material>) => materialsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Material> }) => materialsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => materialsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['materials'] }); setDeleteTarget(null); },
  });

  const openCreate = () => { setEditTarget(null); setForm(defaultForm); setFormError(''); setDialogOpen(true); };
  const openEdit = (m: Material) => {
    setEditTarget(m);
    setForm({ name: m.name, unit: m.unit, pricePerUnit: String(m.pricePerUnit), reorderLevel: String(m.reorderLevel) });
    setFormError(''); setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    const price = parseFloat(form.pricePerUnit);
    if (isNaN(price) || price < 0) { setFormError('Valid price is required'); return; }
    const payload: Partial<Material> = { name: form.name.trim(), unit: form.unit, pricePerUnit: price, reorderLevel: parseFloat(form.reorderLevel) || 0 };
    editTarget ? updateMut.mutate({ id: editTarget.id, data: payload }) : createMut.mutate(payload);
  };

  const filtered = materials.filter((m: Material) => m.name.toLowerCase().includes(search.toLowerCase()));
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Materials">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search materials…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Material</Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Price / Unit</TableHead>
                <TableHead className="text-right">Reorder Level</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No materials found.</TableCell></TableRow>
              ) : filtered.map((m: Material) => (
                <TableRow key={m.id}>
                  <TableCell className="font-semibold">{m.name}</TableCell>
                  <TableCell><Badge variant="secondary">{m.unit}</Badge></TableCell>
                  <TableCell className="text-right">₱{Number(m.pricePerUnit).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{m.reorderLevel}</TableCell>
                  <TableCell className="text-right">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>{editTarget ? 'Edit Material' : 'New Material'}</DialogTitle></DialogHeader>
            <Tabs defaultValue="details">
              <TabsList className="mb-4">{editTarget && <TabsTrigger value="history">Price History</TabsTrigger>}<TabsTrigger value="details">Details</TabsTrigger></TabsList>
              <TabsContent value="details">
                <div className="space-y-4">
                  {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
                  <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></div>
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v as MeasurementUnit }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Price per Unit (₱)</Label><Input type="number" step="0.01" value={form.pricePerUnit} onChange={(e) => setForm((f) => ({ ...f, pricePerUnit: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Reorder Level</Label><Input type="number" value={form.reorderLevel} onChange={(e) => setForm((f) => ({ ...f, reorderLevel: e.target.value }))} /></div>
                </div>
              </TabsContent>
              {editTarget && (
                <TabsContent value="history">
                  {priceHistory.length === 0 ? (
                    <p className="text-muted-foreground text-sm py-4">No price history yet.</p>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Price</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {priceHistory.map((h: MaterialPriceHistory) => (
                          <TableRow key={h.id}><TableCell>{dayjs(h.effectiveAt).format('MMM D, YYYY')}</TableCell><TableCell className="text-right">₱{Number(h.pricePerUnit).toFixed(2)}</TableCell></TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              )}
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete Material</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</AlertDialogDescription></AlertDialogHeader>
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
