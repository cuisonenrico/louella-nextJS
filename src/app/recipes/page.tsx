'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, Search, CookingPot, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { recipesApi, productsApi, materialsApi } from '@/lib/apiServices';
import type { Recipe, RecipeCost, Product, Material, MeasurementUnit, RecipeItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const UNITS: MeasurementUnit[] = ['KG', 'G', 'LITER', 'ML', 'PIECE', 'DOZEN', 'BAG', 'SACHET', 'CUP', 'TBSP', 'TSP'];

interface IngredientRow { materialId: number; quantity: string; unit: MeasurementUnit; }

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function RecipesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Recipe | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [costTarget, setCostTarget] = useState<RecipeCost | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Form state
  const [productId, setProductId] = useState('');
  const [recipeYield, setRecipeYield] = useState('1');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  const { data: recipes = [], isLoading } = useQuery({ queryKey: ['recipes'], queryFn: () => recipesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: () => materialsApi.list().then((r) => r.data) });

  const createMut = useMutation({
    mutationFn: (data: { productId: number; recipeYield?: number; notes?: string; items: { materialId: number; quantity: number; unit: string }[] }) => recipesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { recipeYield?: number; notes?: string; items?: { materialId: number; quantity: number; unit: string }[] } }) => recipesApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => recipesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); setDeleteTarget(null); },
  });

  const openCreate = () => {
    setEditTarget(null); setProductId(''); setRecipeYield('1'); setNotes('');
    setIngredients([{ materialId: 0, quantity: '', unit: 'KG' }]);
    setFormError(''); setDialogOpen(true);
  };
  const openEdit = (r: Recipe) => {
    setEditTarget(r); setProductId(String(r.productId)); setRecipeYield(String(r.recipeYield)); setNotes(r.notes ?? '');
    setIngredients(r.items.map((i) => ({ materialId: i.materialId, quantity: String(i.quantity), unit: i.unit })));
    setFormError(''); setDialogOpen(true);
  };
  const showCost = async (r: Recipe) => {
    setCostLoading(true); setCostDialogOpen(true); setCostTarget(null);
    try { const res = await recipesApi.cost(r.id); setCostTarget(res.data); } catch { setCostTarget(null); }
    setCostLoading(false);
  };

  const addIngredient = () => setIngredients((prev) => [...prev, { materialId: 0, quantity: '', unit: 'KG' }]);
  const removeIngredient = (idx: number) => setIngredients((prev) => prev.filter((_, i) => i !== idx));
  const updateIngredient = (idx: number, field: keyof IngredientRow, value: string | number) => {
    setIngredients((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const handleSave = () => {
    setFormError('');
    const validIngredients = ingredients.filter((i) => i.materialId > 0 && parseFloat(i.quantity) > 0);
    if (validIngredients.length === 0) { setFormError('At least one ingredient is required'); return; }
    const items = validIngredients.map((i) => ({ materialId: i.materialId, quantity: parseFloat(i.quantity), unit: i.unit }));
    const yieldVal = parseFloat(recipeYield) || 1;
    if (editTarget) {
      updateMut.mutate({ id: editTarget.id, data: { recipeYield: yieldVal, notes: notes || undefined, items } });
    } else {
      if (!productId) { setFormError('Product is required'); return; }
      createMut.mutate({ productId: parseInt(productId), recipeYield: yieldVal, notes: notes || undefined, items });
    }
  };

  const filtered = recipes.filter((r: Recipe) => {
    const pName = r.product?.name ?? '';
    return pName.toLowerCase().includes(search.toLowerCase());
  });
  const saving = createMut.isPending || updateMut.isPending;
  const matMap = Object.fromEntries(materials.map((m: Material) => [m.id, m.name]));

  return (
    <AuthGuard>
      <AppLayout title="Recipes">
        <div className="flex justify-between items-center mb-4">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by product…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Recipe</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No recipes found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((r: Recipe) => (
              <Card key={r.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{r.product?.name ?? `Product #${r.productId}`}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">Yield: {r.recipeYield} · {r.items.length} ingredient{r.items.length !== 1 ? 's' : ''}</p>
                    </div>
                    <Badge variant="secondary"><CookingPot className="h-3 w-3 mr-1" />Recipe</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pb-2">
                  <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
                    {expandedId === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {expandedId === r.id ? 'Hide' : 'Show'} ingredients
                  </button>
                  {expandedId === r.id && (
                    <ul className="text-sm space-y-1">
                      {r.items.map((item: RecipeItem) => (
                        <li key={item.id} className="flex justify-between">
                          <span>{matMap[item.materialId] ?? `#${item.materialId}`}</span>
                          <span className="text-muted-foreground">{item.quantity} {item.unit}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.notes && <p className="text-xs text-muted-foreground mt-2 italic">{r.notes}</p>}
                </CardContent>
                <CardFooter className="gap-2 pt-0">
                  <Button size="sm" variant="outline" onClick={() => showCost(r)}><DollarSign className="mr-1 h-3 w-3" />Cost</Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive ml-auto" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editTarget ? 'Edit Recipe' : 'New Recipe'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              {!editTarget && (
                <div className="space-y-2">
                  <Label>Product</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map((p: Product) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2"><Label>Yield (batches)</Label><Input type="number" value={recipeYield} onChange={(e) => setRecipeYield(e.target.value)} /></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>

              <div className="space-y-2">
                <div className="flex justify-between items-center"><Label>Ingredients</Label><Button type="button" size="sm" variant="outline" onClick={addIngredient}><Plus className="mr-1 h-3 w-3" />Add</Button></div>
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Select value={String(ing.materialId || '')} onValueChange={(v) => updateIngredient(idx, 'materialId', parseInt(v))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Material" /></SelectTrigger>
                        <SelectContent>{materials.map((m: Material) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input type="number" placeholder="Qty" value={ing.quantity} onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)} className="w-20 h-9" />
                    <Select value={ing.unit} onValueChange={(v) => updateIngredient(idx, 'unit', v)}>
                      <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeIngredient(idx)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cost Breakdown Dialog */}
        <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Cost Breakdown</DialogTitle></DialogHeader>
            {costLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : costTarget ? (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p><strong>{costTarget.productName}</strong></p>
                  <p className="text-muted-foreground">Yield: {costTarget.recipeYield} · Price: ₱{Number(costTarget.productPrice).toFixed(2)}</p>
                </div>
                <Table>
                  <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Cost</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {costTarget.items.map((i) => (
                      <TableRow key={i.materialId}>
                        <TableCell>{i.materialName}</TableCell>
                        <TableCell className="text-right">{i.quantity} {i.unit}</TableCell>
                        <TableCell className="text-right">₱{i.cost.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 rounded bg-muted"><p className="text-muted-foreground">Batch Cost</p><p className="font-semibold">₱{costTarget.totalBatchCost.toFixed(2)}</p></div>
                  <div className="p-2 rounded bg-muted"><p className="text-muted-foreground">Cost / Unit</p><p className="font-semibold">₱{costTarget.costPerUnit.toFixed(2)}</p></div>
                  <div className="p-2 rounded bg-muted col-span-2"><p className="text-muted-foreground">Gross Margin</p><p className="font-semibold">{(costTarget.grossMargin * 100).toFixed(1)}%</p></div>
                </div>
              </div>
            ) : <p className="text-muted-foreground text-center py-4">Unable to load cost data.</p>}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Delete Recipe</AlertDialogTitle><AlertDialogDescription>Delete recipe for <strong>{deleteTarget?.product?.name}</strong>?</AlertDialogDescription></AlertDialogHeader>
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
