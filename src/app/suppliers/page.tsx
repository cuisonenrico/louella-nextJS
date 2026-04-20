'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { suppliersApi } from '@/lib/apiServices';
import type { Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SupplierForm { name: string; contact: string; phone: string; email: string; address: string; isActive: boolean; }
const defaultForm: SupplierForm = { name: '', contact: '', phone: '', email: '', address: '', isActive: true };

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [formError, setFormError] = useState('');

  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersApi.list().then((r) => r.data) });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Supplier>) => suppliersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Supplier> }) => suppliersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => suppliersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setDeleteTarget(null); },
  });

  const openCreate = () => { setEditTarget(null); setForm(defaultForm); setFormError(''); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditTarget(s);
    setForm({ name: s.name, contact: s.contact ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', isActive: s.isActive });
    setFormError(''); setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    const payload: Partial<Supplier> = {
      name: form.name.trim(), contact: form.contact || undefined, phone: form.phone || undefined,
      email: form.email || undefined, address: form.address || undefined, isActive: form.isActive,
    };
    editTarget ? updateMutation.mutate({ id: editTarget.id, data: payload }) : createMutation.mutate(payload);
  };

  const filtered = suppliers.filter((s: Supplier) => s.name.toLowerCase().includes(search.toLowerCase()));
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Suppliers">
        <div className="flex justify-between items-center mb-4">
          <Input placeholder="Search suppliers…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Supplier</Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No suppliers found.</TableCell></TableRow>
              ) : filtered.map((s: Supplier) => (
                <TableRow key={s.id}>
                  <TableCell className="font-semibold">{s.name}</TableCell>
                  <TableCell>{s.contact ?? '—'}</TableCell>
                  <TableCell>{s.phone ?? '—'}</TableCell>
                  <TableCell>{s.email ?? '—'}</TableCell>
                  <TableCell><Badge variant={s.isActive ? 'default' : 'secondary'}>{s.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editTarget ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div className="space-y-2"><Label>Contact Person</Label><Input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}
                onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}>
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </AuthGuard>
  );
}
