'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { Branch, Product, ProductionOrder, ProductType } from '@/types';
import { productionOrdersApi } from '@/lib/apiServices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { extractError } from '@/lib/errors';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };

interface ProductionOrderFormDialogProps {
  open: boolean;
  editTarget: ProductionOrder | null;
  filterDate: string;
  activeBranchId: number | null;
  activeBranches: Branch[];
  activeProducts: Product[];
  onSaved: () => void;
  onClose: () => void;
}

export function ProductionOrderFormDialog({
  open,
  editTarget,
  filterDate,
  activeBranchId,
  activeBranches,
  activeProducts,
  onSaved,
  onClose,
}: ProductionOrderFormDialogProps) {
  const qc = useQueryClient();
  const [formNotes, setFormNotes] = useState('');
  const [formBranchId, setFormBranchId] = useState<number | null>(null);
  const [formItems, setFormItems] = useState<Map<number, number>>(new Map());
  const [formError, setFormError] = useState('');
  const inputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Reset form whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setFormNotes(editTarget.notes ?? '');
      setFormBranchId(editTarget.branchId ?? activeBranchId);
      const items = new Map<number, number>();
      activeProducts.forEach((p) => items.set(p.id, 0));
      editTarget.items.forEach((i) => items.set(i.productId, i.yield));
      setFormItems(items);
    } else {
      setFormNotes('');
      setFormBranchId(activeBranchId);
      const defaultItems = new Map<number, number>();
      activeProducts.forEach((p) => defaultItems.set(p.id, 0));
      setFormItems(defaultItems);
    }
    setFormError('');
  }, [open, editTarget, activeBranchId, activeProducts]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['production-orders'] });
    qc.invalidateQueries({ queryKey: ['planned-yield'] });
    qc.invalidateQueries({ queryKey: ['production'] });
  }, [qc]);

  const createMutation = useMutation({
    mutationFn: (data: { branchId: number; date: string; notes?: string; items: { productId: number; yield: number }[] }) =>
      productionOrdersApi.create(data),
    onSuccess: () => { invalidate(); onSaved(); onClose(); toast.success('Order saved'); },
    onError: (err) => { const text = extractError(err); setFormError(text); toast.error(text); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { branchId?: number; notes?: string; items?: { productId: number; yield: number }[] } }) =>
      productionOrdersApi.update(id, data),
    onSuccess: () => { invalidate(); onSaved(); onClose(); toast.success('Order saved'); },
    onError: (err) => { const text = extractError(err); setFormError(text); toast.error(text); },
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const productsByType = useMemo(() => {
    const map = new Map<ProductType, Product[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    activeProducts.forEach((p) => map.get(p.type)?.push(p));
    map.forEach((prods) => prods.sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name)));
    return map;
  }, [activeProducts]);

  const orderedProducts = useMemo(() => {
    const list: Product[] = [];
    PRODUCT_TYPE_ORDER.forEach((type) => list.push(...(productsByType.get(type) ?? [])));
    return list;
  }, [productsByType]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, productId: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const idx = orderedProducts.findIndex((p) => p.id === productId);
    const next = orderedProducts[idx + 1];
    if (!next) return;
    const nextEl = inputRefs.current.get(next.id);
    if (nextEl) { nextEl.focus(); nextEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }, [orderedProducts]);

  const handleSave = useCallback(() => {
    setFormError('');
    if (!formBranchId) { setFormError('Select a branch before saving.'); return; }
    const items = Array.from(formItems.entries()).map(([productId, yieldVal]) => ({ productId, yield: yieldVal }));
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: { branchId: formBranchId, notes: formNotes || undefined, items } });
    } else {
      createMutation.mutate({ branchId: formBranchId, date: filterDate, notes: formNotes || undefined, items });
    }
  }, [formItems, formNotes, formBranchId, filterDate, editTarget, createMutation, updateMutation]);

  const totalFormYield = useMemo(() => Array.from(formItems.values()).reduce((a, b) => a + b, 0), [formItems]);

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editTarget ? `Edit PO #${editTarget.id}` : 'New Production Order'}</DialogTitle>
        </DialogHeader>

        {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

        <div className="space-y-1">
          <Label>Deliver to Branch</Label>
          <Select value={formBranchId ? String(formBranchId) : ''} onValueChange={(v) => setFormBranchId(Number.parseInt(v, 10))}>
            <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {activeBranches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Notes (optional)</Label>
          <Textarea placeholder="Order notes..." value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="h-14 resize-none" />
        </div>

        <div className="overflow-y-auto flex-1 rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="w-8 text-center">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="w-36 text-right">Yield</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PRODUCT_TYPE_ORDER.map((type) => {
                const prods = productsByType.get(type) ?? [];
                if (prods.length === 0) return null;
                return (
                  <Fragment key={type}>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableCell colSpan={3} className="py-1.5 px-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{TYPE_LABELS[type]}</span>
                      </TableCell>
                    </TableRow>
                    {prods.map((p, idx) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            ref={(el) => { if (el) inputRefs.current.set(p.id, el); else inputRefs.current.delete(p.id); }}
                            type="number"
                            className="h-8 w-28 ml-auto text-right"
                            min={0}
                            value={String(formItems.get(p.id) ?? 0)}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setFormItems((prev) => { const next = new Map(prev); next.set(p.id, val); return next; });
                            }}
                            onKeyDown={(e) => handleInputKeyDown(e, p.id)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="text-sm text-right font-semibold text-primary pt-1">
          Total: {totalFormYield.toLocaleString()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editTarget ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
