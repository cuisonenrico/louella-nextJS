'use client';

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Product, ProductionOrder, ProductionSuggestion, ProductType, SuggestionPeriod } from '@/types';
import { productionOrdersApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';
import { applyAllSuggestions } from '../lib/applySuggestions';

export const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

interface UseOrderFormArgs {
  open: boolean;
  editTarget: ProductionOrder | null;
  filterDate: string;
  activeBranchId: number | null;
  activeProducts: Product[];
}

/**
 * The branch-order form's state and save: items, notes, branch, suggestions.
 * Shared by the desktop dialog and the phone form so both save the same way.
 */
export function useOrderForm({ open, editTarget, filterDate, activeBranchId, activeProducts }: UseOrderFormArgs) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [branchId, setBranchId] = useState<number | null>(null);
  const [items, setItems] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState('');
  const [suggestPeriod, setSuggestPeriod] = useState<SuggestionPeriod>('7d');

  const suggestionsQuery = useQuery({
    queryKey: ['production-suggestions', branchId, suggestPeriod, filterDate],
    queryFn: () => productionOrdersApi.suggestions(branchId!, suggestPeriod, filterDate).then((r) => r.data),
    enabled: open && branchId != null,
  });

  const suggestionByProduct = useMemo(() => {
    const map = new Map<number, ProductionSuggestion>();
    for (const s of suggestionsQuery.data?.suggestions ?? []) map.set(s.productId, s);
    return map;
  }, [suggestionsQuery.data]);

  const applyAll = useCallback(() => {
    const qtyMap = new Map<number, number>();
    for (const [productId, s] of suggestionByProduct) qtyMap.set(productId, s.suggestedQty);
    setItems((prev) => applyAllSuggestions(prev, qtyMap));
  }, [suggestionByProduct]);

  // Reset the form whenever it opens. Done as a render-time state adjustment
  // (React's "adjust state when props change" pattern) rather than an effect,
  // so it doesn't trigger a cascading second render.
  // Starts closed, so a form mounted already open (the phone form) initialises too.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const next = new Map<number, number>();
      activeProducts.forEach((p) => next.set(p.id, 0));
      if (editTarget) {
        editTarget.items.forEach((i) => next.set(i.productId, i.yield));
        setNotes(editTarget.notes ?? '');
        setBranchId(editTarget.branchId ?? activeBranchId);
      } else {
        setNotes('');
        setBranchId(activeBranchId);
      }
      setItems(next);
      setError('');
    }
  }

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['production-orders'] });
    qc.invalidateQueries({ queryKey: ['planned-yield'] });
    qc.invalidateQueries({ queryKey: ['production'] });
  }, [qc]);

  const onError = (err: unknown) => {
    const text = extractError(err);
    setError(text);
    toast.error(text);
  };

  // One key per new order, so a double click on Save creates one order.
  const [createKey, renewCreateKey] = useIdempotencyKey();
  const createMutation = useMutation({
    mutationFn: (data: { branchId: number; date: string; notes?: string; items: { productId: number; yield: number }[] }) =>
      productionOrdersApi.create(data, createKey).then((r) => r.data),
    onSuccess: () => { renewCreateKey(); invalidate(); },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { branchId?: number; notes?: string; items?: { productId: number; yield: number }[] } }) =>
      productionOrdersApi.update(id, data).then((r) => r.data),
    onSuccess: () => invalidate(),
    onError,
  });

  const saving = createMutation.isPending || updateMutation.isPending;

  const setItem = useCallback((productId: number, qty: number) => {
    setItems((prev) => new Map(prev).set(productId, qty));
  }, []);

  /** Save the order; resolves to it, or to null when the server refused (the error is already shown). */
  const save = useCallback(async (): Promise<ProductionOrder | null> => {
    setError('');
    if (!branchId) {
      setError('Select a branch before saving.');
      return null;
    }
    const payload = Array.from(items.entries()).map(([productId, y]) => ({ productId, yield: y }));
    try {
      const saved = editTarget
        ? await updateMutation.mutateAsync({ id: editTarget.id, data: { branchId, notes: notes || undefined, items: payload } })
        : await createMutation.mutateAsync({ branchId, date: filterDate, notes: notes || undefined, items: payload });
      toast.success('Order saved');
      return saved;
    } catch {
      return null;
    }
  }, [branchId, items, notes, editTarget, filterDate, createMutation, updateMutation]);

  const productsByType = useMemo(() => {
    const map = new Map<ProductType, Product[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    activeProducts.forEach((p) => map.get(p.type)?.push(p));
    map.forEach((prods) => prods.sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name))));
    return map;
  }, [activeProducts]);

  const total = useMemo(() => Array.from(items.values()).reduce((a, b) => a + b, 0), [items]);

  return {
    items, setItem, replaceItems: setItems, notes, setNotes, branchId, setBranchId,
    suggestPeriod, setSuggestPeriod, suggestionByProduct, suggestionsQuery, applyAll,
    productsByType, total, save, saving, error, setError,
  };
}
