'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle, Info } from 'lucide-react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, InventorySummaryData, Product, ProductType } from '@/types';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import InventoryFilterBar from '../components/InventoryFilterBar';
import InventorySummaryPanel from '../components/InventorySummaryPanel';
import InventoryPendingChangesBar from '../components/InventoryPendingChangesBar';
import InventoryTypeTables from '../components/InventoryTypeTables';
import InventoryAdjustmentsDialog from '../components/InventoryAdjustmentsDialog';
import { useInventoryDisplayRows } from '../hooks/useInventoryDisplayRows';
import { CardContent } from '@/components/ui/card';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

export default function InventoryDetailsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const today = dayjs().format('YYYY-MM-DD');

  // Filter state
  const [dateMode, setDateMode] = useState<'date' | 'range'>('date');
  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [filterBranch, setFilterBranch] = useState('');

  const isRange = filterDateFrom !== filterDateTo;
  const selectedBranchId = useMemo(() => {
    const parsed = Number.parseInt(filterBranch, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [filterBranch]);

  // Pending edits
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, Partial<Inventory>>>(new Map());
  const [cascadeWarning, setCascadeWarning] = useState<{ branchId: number; productId: number; fromDate: string } | null>(null);
  const [adjRow, setAdjRow] = useState<Inventory | null>(null);

  // Queries
  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const invQuery = useQuery<Inventory[]>({
    queryKey: ['inventory', filterDateFrom, filterDateTo, filterBranch],
    queryFn: () => {
      if (selectedBranchId) {
        return filterDateFrom === filterDateTo
          ? inventoryApi.byBranchDate(selectedBranchId, filterDateFrom).then((r) => r.data)
          : inventoryApi.byBranchDateRange(selectedBranchId, filterDateFrom, filterDateTo).then((r) => r.data);
      }
      return inventoryApi.byDateRange(filterDateFrom, filterDateTo).then((r) => r.data);
    },
  });

  const summaryQuery = useQuery<InventorySummaryData>({
    queryKey: ['inventory-summary', filterDateFrom, filterDateTo, filterBranch],
    queryFn: () => inventoryApi.summary(filterDateFrom, filterDateTo, filterBranch || undefined).then((r) => r.data),
  });

  const rows = invQuery.data ?? [];
  const displayRows = useInventoryDisplayRows(rows, filterBranch, isRange);

  // Group by product type
  const rowsByType = useMemo(() => {
    const map = new Map<ProductType, Inventory[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    for (const row of displayRows) {
      const product = productById.get(row.productId);
      if (product) map.get(product.type)?.push(row);
    }
    return map;
  }, [displayRows, productById]);

  // Uninitialized products count
  const uninitializedCount = useMemo(() => {
    if (isRange || filterBranch === '') return 0;
    const existingProductIds = new Set(rows.map((r) => r.productId));
    return products.filter((p) => p.isActive && !existingProductIds.has(p.id)).length;
  }, [isRange, filterBranch, rows, products]);

  // Reset pending on filter change
  useEffect(() => { setPendingUpdates(new Map()); }, [filterDateFrom, filterDateTo, filterBranch]);

  // Date helpers
  const commitDates = useCallback((from: string, to: string) => {
    setFilterDateFrom(from);
    setFilterDateTo(to);
  }, []);

  const stepDate = useCallback((delta: number) => {
    if (dateMode === 'date') {
      const next = dayjs(draftFrom).add(delta, 'day').format('YYYY-MM-DD');
      setDraftFrom(next); setDraftTo(next); commitDates(next, next);
    } else {
      const span = dayjs(draftTo).diff(dayjs(draftFrom), 'day') + 1;
      const from = dayjs(draftFrom).add(delta * span, 'day').format('YYYY-MM-DD');
      const to = dayjs(draftTo).add(delta * span, 'day').format('YYYY-MM-DD');
      setDraftFrom(from); setDraftTo(to); commitDates(from, to);
    }
  }, [dateMode, draftFrom, draftTo, commitDates]);

  const handleDateModeChange = useCallback((mode: 'date' | 'range') => {
    setDateMode(mode);
    if (mode === 'date') { setDraftTo(draftFrom); commitDates(draftFrom, draftFrom); }
  }, [draftFrom, commitDates]);

  // Mutations
  const bulkCreateMutation = useMutation({
    mutationFn: () => {
      const branchId = selectedBranchId ?? Number.parseInt(filterBranch, 10);
      const existingProductIds = new Set(rows.map((r) => r.productId));
      const payload = products
        .filter((p) => p.isActive && !existingProductIds.has(p.id))
        .map((p) => ({ branchId, productId: p.id, date: filterDateFrom, quantity: 0, delivery: 0, leftover: 0, reject: 0 }));
      return inventoryApi.createBulk(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
    onError: (err) => toast.error(extractError(err)),
  });

  // Auto-sync missing product rows when branch is selected
  useEffect(() => {
    if (uninitializedCount > 0 && !invQuery.isLoading && !bulkCreateMutation.isPending) {
      bulkCreateMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uninitializedCount, invQuery.isLoading]);

  const savePendingMutation = useMutation({
    mutationFn: async () => {
      const ops = Array.from(pendingUpdates.entries()).map(([id, data]) =>
        inventoryApi.update(id, data)
      );
      const results = await Promise.all(ops);
      // Check for cascade warnings
      for (const res of results) {
        const result = res.data;
        if (result && typeof result === 'object' && 'cascadeWarning' in result && (result.cascadeWarning as number) > 0) {
          setCascadeWarning({ branchId: result.branchId, productId: result.productId, fromDate: result.date });
        }
      }
    },
    onSuccess: () => {
      setPendingUpdates(new Map());
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      toast.success('Changes saved');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const recascadeMutation = useMutation({
    mutationFn: (data: { branchId: number; productId: number; fromDate: string }) =>
      inventoryApi.recascade(data.branchId, data.productId, data.fromDate),
    onSuccess: () => {
      setCascadeWarning(null);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Cascade applied');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  // Cell editing
  const handleCellChange = useCallback((invId: number, field: 'delivery' | 'leftover' | 'reject', value: number) => {
    setPendingUpdates((prev) => {
      const next = new Map(prev);
      const existing = next.get(invId) ?? {};
      next.set(invId, { ...existing, [field]: value });
      return next;
    });
  }, []);

  const discardPending = useCallback(() => {
    setPendingUpdates(new Map());
    qc.invalidateQueries({ queryKey: ['inventory'] });
  }, [qc]);

  const totalPending = pendingUpdates.size;
  const isEditable = !isRange && filterBranch !== '';

  return (
    <AuthGuard>
      <AppLayout title="Inventory Details">
        <TooltipProvider>
          <InventoryFilterBar
            dateMode={dateMode}
            draftFrom={draftFrom}
            draftTo={draftTo}
            filterBranch={filterBranch}
            branches={branches}
            today={today}
            onDateModeChange={handleDateModeChange}
            onDraftFromChange={setDraftFrom}
            onDraftToChange={setDraftTo}
            onCommitDates={commitDates}
            onStepDate={stepDate}
            onBranchChange={setFilterBranch}
            onImportOpen={() => router.push('/inventory-import')}
          />

          <InventorySummaryPanel
            summary={summaryQuery.data ?? null}
            filterDateFrom={filterDateFrom}
            filterDateTo={filterDateTo}
          />

          <InventoryPendingChangesBar
            totalPending={totalPending}
            isSaving={savePendingMutation.isPending}
            onDiscard={discardPending}
            onSave={() => savePendingMutation.mutate()}
          />

          {!isEditable && displayRows.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 mb-3">
              <Info className="h-4 w-4 shrink-0" />
              {isRange
                ? 'Date range mode is read-only. Switch to single date and select a branch to edit.'
                : 'Select a specific branch to enable editing.'}
            </div>
          )}

          {/* Per-type grids */}
          {invQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : displayRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No inventory data. Select a branch and date.</p>
          ) : (
            <InventoryTypeTables
              rowsByType={rowsByType}
              productById={productById}
              pendingUpdates={pendingUpdates}
              isRange={isRange}
              isEditable={isEditable}
              hasBranchFilter={filterBranch !== ''}
              onAdjustmentsOpen={setAdjRow}
              onCellChange={handleCellChange}
            />
          )}

          {/* Cascade warning dialog */}
          <Dialog open={!!cascadeWarning} onOpenChange={() => setCascadeWarning(null)}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" /> Cascade Update
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Changing the leftover affects the opening quantity for subsequent days. Would you like to cascade the update forward?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCascadeWarning(null)}>Skip</Button>
                <Button onClick={() => { if (cascadeWarning) recascadeMutation.mutate(cascadeWarning); }} disabled={recascadeMutation.isPending}>
                  {recascadeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Cascade
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Adjustments dialog */}
          <InventoryAdjustmentsDialog
            inventory={adjRow}
            productName={productById.get(adjRow?.productId ?? 0)?.name ?? ''}
            branches={branches}
            onClose={() => setAdjRow(null)}
          />
        </TooltipProvider>
      </AppLayout>
    </AuthGuard>
  );
}
