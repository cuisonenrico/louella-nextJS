'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import type { Branch, Product, ProductionOrder, ProductionSuggestion, ProductType, SuggestionPeriod } from '@/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { applyAllSuggestions } from '../lib/applySuggestions';
import { productionOrdersApi } from '@/lib/apiServices';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SheetInput } from '@/components/sheet/SheetInput';
import { useSheetNavigation } from '@/components/sheet/useSheetNavigation';
import { SHEET_BANNER, SHEET_CELL, SHEET_HEAD, SHEET_TABLE } from '@/components/sheet/styles';
import { cn } from '@/lib/utils';
import { extractError } from '@/lib/errors';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };
/** The sheet has a single editable column; named so the nav hook can index it. */
const YIELD_COLS = ['yield'] as const;

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
  const [suggestPeriod, setSuggestPeriod] = useState<SuggestionPeriod>('7d');

  const suggestionsQuery = useQuery({
    queryKey: ['production-suggestions', formBranchId, suggestPeriod, filterDate],
    queryFn: () =>
      productionOrdersApi
        .suggestions(formBranchId!, suggestPeriod, filterDate)
        .then((r) => r.data),
    enabled: open && formBranchId != null,
  });

  const suggestionByProduct = useMemo(() => {
    const map = new Map<number, ProductionSuggestion>();
    for (const s of suggestionsQuery.data?.suggestions ?? []) {
      map.set(s.productId, s);
    }
    return map;
  }, [suggestionsQuery.data]);

  const handleApplyAll = useCallback(() => {
    const qtyMap = new Map<number, number>();
    for (const [productId, s] of suggestionByProduct) {
      qtyMap.set(productId, s.suggestedQty);
    }
    setFormItems((prev) => applyAllSuggestions(prev, qtyMap));
  }, [suggestionByProduct]);

  // Reset the form whenever the dialog opens. Done as a render-time state
  // adjustment (React's "adjust state when props change" pattern) rather than
  // an effect, so it doesn't trigger a cascading second render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const items = new Map<number, number>();
      activeProducts.forEach((p) => items.set(p.id, 0));
      if (editTarget) {
        editTarget.items.forEach((i) => items.set(i.productId, i.yield));
        setFormNotes(editTarget.notes ?? '');
        setFormBranchId(editTarget.branchId ?? activeBranchId);
      } else {
        setFormNotes('');
        setFormBranchId(activeBranchId);
      }
      setFormItems(items);
      setFormError('');
    }
  }

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

  // One editable column, so the sheet's linear and column orders coincide:
  // Enter/Up/Down/Tab all walk the yield column, skipping the type banners.
  const orderedProductIds = useMemo(() => orderedProducts.map((p) => p.id), [orderedProducts]);
  const getInputId = useCallback((productId: number) => `order-yield-${productId}`, []);
  const { moveInColumn, moveLinear } = useSheetNavigation(orderedProductIds, YIELD_COLS, getInputId);

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
    <ResponsiveDialog open={open} onOpenChange={() => onClose()}>
      <ResponsiveDialogContent className="sm:max-w-3xl md:max-h-[90dvh] flex flex-col">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{editTarget ? `Edit PO #${editTarget.id}` : 'New Production Order'}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

        <div className="space-y-1">
          <Label htmlFor="deliver-to-branch">Deliver to Branch</Label>
          <Select value={formBranchId ? String(formBranchId) : ''} onValueChange={(v) => setFormBranchId(Number.parseInt(v, 10))}>
            <SelectTrigger id="deliver-to-branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
            <SelectContent>
              {activeBranches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notes-optional">Notes (optional)</Label>
          <Textarea id="notes-optional" placeholder="Order notes..." value={formNotes} onChange={(e) => setFormNotes(e.target.value)} className="h-14 resize-none" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Suggestions from</span>
            <Select value={suggestPeriod} onValueChange={(v) => setSuggestPeriod(v as SuggestionPeriod)}>
              <SelectTrigger className="h-11 md:h-8 w-[150px] text-base md:text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prev-day">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyAll}
            disabled={suggestionByProduct.size === 0 || suggestionsQuery.isLoading}
          >
            Apply all suggestions
          </Button>
        </div>
        {suggestionsQuery.isError && (
          <p role="alert" className="text-xs text-destructive">
            Could not load suggestions — you can still enter quantities manually.
          </p>
        )}

        {/* Same dense sheet as the inventory and production grids; the dialog's
            flex column supplies the height cap, so the container drops the
            shared max-h in favour of flex-1. */}
        <Table
          containerClassName="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background"
          className={SHEET_TABLE}
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(SHEET_HEAD, 'w-8 text-center')}>#</TableHead>
              <TableHead className={cn(SHEET_HEAD, 'text-left')}>Product</TableHead>
              <TableHead className={cn(SHEET_HEAD, 'w-28 text-right')}>Suggested</TableHead>
              <TableHead className={cn(SHEET_HEAD, 'w-36 text-right')}>Yield</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PRODUCT_TYPE_ORDER.map((type) => {
              const prods = productsByType.get(type) ?? [];
              if (prods.length === 0) return null;
              return (
                <Fragment key={type}>
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className={SHEET_BANNER}>{TYPE_LABELS[type]}</TableCell>
                  </TableRow>
                  {prods.map((p, idx) => (
                    <TableRow key={p.id}>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-center text-xs tabular-nums text-muted-foreground')}>{idx + 1}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 font-medium')}>{p.name}</TableCell>
                      <TableCell className={cn(SHEET_CELL, 'px-2 text-right')}>
                        {(() => {
                          const s = suggestionByProduct.get(p.id);
                          if (!s) return <span className="text-muted-foreground/50 text-xs">—</span>;
                          return (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs font-mono text-primary"
                                  aria-label={`Apply suggested ${s.suggestedQty} for ${p.name}`}
                                  onClick={() =>
                                    setFormItems((prev) => {
                                      const next = new Map(prev);
                                      next.set(p.id, s.suggestedQty);
                                      return next;
                                    })
                                  }
                                >
                                  ↑ {s.suggestedQty}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                avg {s.avgSold.toFixed(1)}/day · {s.daysWithData} day{s.daysWithData === 1 ? '' : 's'} of data
                              </TooltipContent>
                            </Tooltip>
                          );
                        })()}
                      </TableCell>
                      <TableCell className={cn(SHEET_CELL, 'p-0')}>
                        <SheetInput
                          id={getInputId(p.id)}
                          value={formItems.get(p.id) ?? 0}
                          onValueChange={(val) =>
                            setFormItems((prev) => { const next = new Map(prev); next.set(p.id, val); return next; })
                          }
                          onColumnMove={(dir) => moveInColumn(p.id, 'yield', dir)}
                          onLinearMove={(dir) => moveLinear(getInputId(p.id), dir)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>

        <div className="text-sm text-right font-semibold text-primary pt-1">
          Total: {totalFormYield.toLocaleString()}
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editTarget ? 'Save' : 'Create'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
