'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePageHeader } from '@/components/layout/usePageHeader';
import SmallScreenNotice from '@/components/layout/SmallScreenNotice';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Info } from 'lucide-react';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCan } from '@/lib/rbac/useHasFeature';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, InventorySummaryData, Product, ProductType } from '@/types';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSaveShortcut } from '@/components/sheet/useSaveShortcut';
import InventoryFilterBar from '../components/InventoryFilterBar';
import InventorySummaryPanel from '../components/InventorySummaryPanel';
import SheetPendingBar from '@/components/sheet/SheetPendingBar';
import InventoryTypeTables from '../components/InventoryTypeTables';
import InventoryAdjustmentsDialog from '../components/InventoryAdjustmentsDialog';
import { useInventoryDisplayRows } from '../hooks/useInventoryDisplayRows';
// import RejectionByProductCard from '@/components/analytics/RejectionByProductCard';
import QueryError from '@/components/QueryError';
import { TableSkeleton } from '@/components/loading/Skeletons';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

// A stable identity for "no rows yet". Writing `?? []` inline produced a fresh
// array on every render, which changed the dependency of every downstream
// useMemo and rebuilt the grouping and counts each time the page re-rendered.
const NO_ROWS: Inventory[] = [];

export default function InventoryDetailsPage() {
  usePageHeader({ title: 'Inventory Details' });
  const qc = useQueryClient();
  const router = useRouter();
  // Gate on the same keys the endpoints enforce, not on the role.
  //
  // These were `meetsMinRole(role, 'INVENTORY' | 'MANAGER')`, which reads a
  // different axis than the API does: the backend checks feature keys via
  // FeatureGuard, so revoking `inventory-history:edit` for one INVENTORY user
  // still left them an editable sheet whose every save came back 403.
  const canEditInventory = useCan('inventory-history:edit');
  const canCreateInventory = useCan('inventory-history:create');
  const canImport = useCan('inventory-import:import');
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
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery<InventorySummaryData>({
    queryKey: ['inventory-summary', filterDateFrom, filterDateTo, filterBranch],
    queryFn: () => inventoryApi.summary(filterDateFrom, filterDateTo, filterBranch || undefined).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const rows = invQuery.data ?? NO_ROWS;
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

  // Reset pending edits when the filters change. Done as a render-time state
  // adjustment (React's "adjust state when props change" pattern) rather than
  // an effect, so it doesn't trigger a cascading second render.
  const filterKey = `${filterDateFrom}|${filterDateTo}|${filterBranch}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPendingUpdates(new Map());
  }

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

  // Missing product rows are created on an explicit user action (see the
  // "Initialize" button below) rather than as a side effect of viewing a
  // branch — navigation should never silently write to the database.

  // One request for the whole sheet. Sending a PATCH per row hit the global
  // 20-requests/minute throttle partway through any real sheet, and the
  // Promise.all rejected on the first 429 — reporting "save failed" over a
  // partial write. The server applies the batch in one transaction and runs the
  // leftover cascade itself.
  const savePendingMutation = useMutation({
    mutationFn: () =>
      inventoryApi
        .updateBulk(
          Array.from(pendingUpdates.entries()).map(([id, data]) => ({
            id,
            delivery: data.delivery,
            leftover: data.leftover,
            reject: data.reject,
          })),
        )
        .then((r) => r.data),
    onSuccess: (result) => {
      setPendingUpdates(new Map());
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
      toast.success(
        result.cascadeUpdated > 0
          ? `Changes saved — ${result.cascadeUpdated} later ${result.cascadeUpdated === 1 ? 'row' : 'rows'} carried forward`
          : 'Changes saved',
      );
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
  const isEditable = !isRange && filterBranch !== '' && canEditInventory;
  // Adjustments are their own feature, with their own key.
  const canAdjust = useCan('inventory-adjustments:create');

  // Ctrl+S / Cmd+S saves pending edits, matching the Excel workflow the grid emulates.
  useSaveShortcut(totalPending > 0 && !savePendingMutation.isPending, () => savePendingMutation.mutate());

  return (
    <>
        <TooltipProvider>
          <SmallScreenNotice storageKey="inventory-details" />
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
            onImportOpen={canImport ? () => router.push('/inventory-import') : undefined}
          />

          <InventorySummaryPanel
            summary={summaryQuery.data ?? null}
            isLoading={summaryQuery.isLoading || summaryQuery.isFetching}
            filterDateFrom={filterDateFrom}
            filterDateTo={filterDateTo}
          />

          {/* Reject products card temporarily removed to keep the page focused on the table.
          <div className="mb-4">
            <RejectionByProductCard
              startDate={filterDateFrom}
              endDate={filterDateTo}
              branchId={filterBranch || undefined}
            />
          </div>
          */}

          <SheetPendingBar
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

          {/* Explicit initialization — no longer an automatic write-on-view */}
          {canCreateInventory && !isRange && filterBranch !== '' && uninitializedCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2 mb-3">
              <span className="text-muted-foreground">
                {uninitializedCount} product{uninitializedCount === 1 ? '' : 's'} not yet
                started for this day.
              </span>
              <Button
                size="sm"
                onClick={() => bulkCreateMutation.mutate()}
                disabled={bulkCreateMutation.isPending}
              >
                {bulkCreateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Initialize {uninitializedCount} row{uninitializedCount === 1 ? '' : 's'}
              </Button>
            </div>
          )}

          {/* Per-type grids */}
          {invQuery.isError ? (
            <QueryError
              error={invQuery.error}
              onRetry={() => invQuery.refetch()}
              className="my-6"
            />
          ) : invQuery.isLoading ? (
            <TableSkeleton rows={8} columns={6} className="py-4" />
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
              canAdjust={canAdjust}
              onAdjustmentsOpen={setAdjRow}
              onCellChange={handleCellChange}
            />
          )}

          {/* Adjustments dialog.
              `adjRow` is the row as it was when the gear was clicked. Re-reading
              it from the live query means adding or deleting an adjustment shows
              up in the dialog immediately, instead of only after a close/reopen. */}
          <InventoryAdjustmentsDialog
            inventory={adjRow ? (rows.find((r) => r.id === adjRow.id) ?? adjRow) : null}
            productName={productById.get(adjRow?.productId ?? 0)?.name ?? ''}
            branches={branches}
            onClose={() => setAdjRow(null)}
          />
        </TooltipProvider>
      </>
  );
}
