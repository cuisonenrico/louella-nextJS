'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi } from '@/lib/apiServices';
import type { Branch } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface BranchForm { name: string; address: string; phone: string; isActive: boolean; }
const defaultForm: BranchForm = { name: '', address: '', phone: '', isActive: true };

export default function BranchesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [formError, setFormError] = useState('');

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Branch>) => branchesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setDialogOpen(false); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Branch> }) => branchesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setDialogOpen(false); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => branchesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  const openCreate = () => { setEditTarget(null); setForm(defaultForm); setFormError(''); setDialogOpen(true); };
  const openEdit = (b: Branch) => {
    setEditTarget(b);
    setForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '', isActive: b.isActive });
    setFormError(''); setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Branch name is required.'); return; }
    const payload: Partial<Branch> = { name: form.name.trim(), address: form.address || undefined, phone: form.phone || undefined, isActive: form.isActive };
    editTarget ? updateMutation.mutate({ id: editTarget.id, data: payload }) : createMutation.mutate(payload);
  };

  const filtered = branches.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Branches">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search branches…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Branch</Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No branches found.</TableCell></TableRow>
              ) : filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-semibold">{b.name}</TableCell>
                  <TableCell>{b.address ?? '—'}</TableCell>
                  <TableCell>{b.phone ?? '—'}</TableCell>
                  <TableCell><Badge variant={b.isActive ? 'default' : 'secondary'}>{b.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(b)}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editTarget ? 'Edit Branch' : 'New Branch'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.isActive ? 'active' : 'inactive'} onValueChange={(v) => setForm((f) => ({ ...f, isActive: v === 'active' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                </Select>
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
              <AlertDialogTitle>Delete Branch</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}
                onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}>
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </AuthGuard>
  );
}
