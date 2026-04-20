'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import dayjs from 'dayjs';
import { Plus, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { productsApi } from '@/lib/apiServices';
import type { Product, ProductPriceHistory, ProductType } from '@/types';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const PRODUCT_TYPES: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

interface ProductFormData {
  name: string;
  type: ProductType;
  price: string;
  isActive: boolean;
  date: string;
}

const defaultForm: ProductFormData = {
  name: '',
  type: 'BREAD',
  price: '0',
  isActive: true,
  date: dayjs().format('YYYY-MM-DD'),
};

function ProductPriceHistoryTab({ productId }: { productId: number }) {
  const { data: history = [], isLoading } = useQuery<ProductPriceHistory[]>({
    queryKey: ['product-price-history', productId],
    queryFn: () => productsApi.priceHistory(productId).then((r) => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (history.length === 0) return <p className="text-muted-foreground py-2">No price changes recorded yet.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Effective Date</TableHead>
          <TableHead className="text-right">Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((h) => (
          <TableRow key={h.id}>
            <TableCell>{dayjs(h.effectiveAt).format('MMM D, YYYY')}</TableCell>
            <TableCell className="text-right">₱{h.price.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormData>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState('details');

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: () => productsApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Product>) => productsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setDialogOpen(false); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Product> }) => productsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setDialogOpen(false); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setFormError('');
    setActiveTab('details');
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditTarget(p);
    setForm({
      name: p.name,
      type: p.type,
      price: p.price.toString(),
      isActive: p.isActive,
      date: p.date ? dayjs(p.date).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    });
    setFormError('');
    setActiveTab('details');
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Product name is required.'); return; }
    const payload: Partial<Product> = {
      name: form.name.trim(),
      type: form.type,
      price: parseFloat(form.price) || 0,
      isActive: form.isActive,
      date: form.date,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AppLayout title="Products">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Launch Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No products found.</TableCell></TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">{p.name}</TableCell>
                    <TableCell><Badge variant="outline">{p.type}</Badge></TableCell>
                    <TableCell className="text-right">₱{p.price.toFixed(2)}</TableCell>
                    <TableCell>{p.date ? dayjs(p.date).format('MMM D, YYYY') : '—'}</TableCell>
                    <TableCell><Badge variant={p.isActive ? 'default' : 'secondary'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}><Trash2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editTarget ? 'Edit Product' : 'New Product'}</DialogTitle>
            </DialogHeader>
            {editTarget ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">Price History</TabsTrigger>
                </TabsList>
                <TabsContent value="details">
                  <ProductForm form={form} setForm={setForm} formError={formError} />
                </TabsContent>
                <TabsContent value="history">
                  <ProductPriceHistoryTab productId={editTarget.id} />
                </TabsContent>
              </Tabs>
            ) : (
              <ProductForm form={form} setForm={setForm} formError={formError} />
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              {activeTab === 'details' && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (deleteTarget) deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
                }}
              >
                {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppLayout>
    </AuthGuard>
  );
}

function ProductForm({ form, setForm, formError }: { form: ProductFormData; setForm: React.Dispatch<React.SetStateAction<ProductFormData>>; formError: string }) {
  return (
    <div className="space-y-4 py-2">
      {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as ProductType }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PRODUCT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Price (₱)</Label>
        <Input type="number" min={0} step={0.01} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Launch Date</Label>
        <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={form.isActive ? 'active' : 'inactive'} onValueChange={(v) => setForm((f) => ({ ...f, isActive: v === 'active' }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
