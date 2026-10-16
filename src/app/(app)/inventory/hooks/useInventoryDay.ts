'use client';

import { useCallback, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { useCan } from '@/lib/rbac/useHasFeature';
import { useAuth } from '@/contexts/AuthContext';
import { manilaToday } from '@/lib/manilaDate';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, InventorySummaryData, Product, ProductType } from '@/types';
import { extractError } from '@/lib/errors';
import { useSaveShortcut } from '@/components/sheet/useSaveShortcut';
import { useUnsavedChangesGuard } from '@/components/sheet/useUnsavedChangesGuard';
import { BRANCH_CASH_KEY } from '@/components/branch-cash/BranchCashPanel';
import { useInventoryDisplayRows } from './useInventoryDisplayRows';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

// A stable identity for "no rows yet". Writing `?? []` inline produced a fresh
// array on every render, which changed the dependency of every downstream
// useMemo and rebuilt the grouping and counts each time the page re-rendered.
const NO_ROWS: Inventory[] = [];

/**
 * Everything the inventory sheet holds for one branch and day (or range):
 * filters, queries, staged edits and the writes. The desktop grid and the
 * phone count view both render from this, so the rules live in one place.
 */
export function useInventoryDay({ requireBranch = false }: { requireBranch?: boolean } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  // Gate on the same keys the endpoints enforce, not on the role.
  //
  // These were `meetsMinRole(role, 'INVENTORY' | 'MANAGER')`, which reads a
  // different axis than the API does: the backend checks feature keys via
  // FeatureGuard, so revoking `inventory-history:edit` for one INVENTORY user
  // still left them an editable sheet whose every save came back 403.
  const canEditInventory = useCan('inventory-history:edit');
  const canCreateInventory = useCan('inventory-history:create');
  const canImport = useCan('inventory-import:import');
  const canSeeCash = useCan('branch-cash');
  const canSeeRevenue = useCan('inventory-history:revenue');
  // Manila's day, not the device's: a phone or CI runner in another zone would
  // otherwise open the sheet on the wrong date (AGENTS.md: pin the zone).
  const today = manilaToday();

  // Filter state
  const [dateMode, setDateMode] = useState<'date' | 'range'>('date');
  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [chosenBranch, setFilterBranch] = useState('');

  const isRange = filterDateFrom !== filterDateTo;

  // Pending edits
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, Partial<Inventory>>>(new Map());
  const [adjRow, setAdjRow] = useState<Inventory | null>(null);
  // Leaving the sheet, or changing the day or branch (which resets the edits
  // below), asks before throwing away unsaved cells.
  const { confirmDiscard, dialog: discardDialog } = useUnsavedChangesGuard(pendingUpdates.size > 0);

  // Queries
  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // The phone views always show one branch. Until someone picks one, that is
  // the account's own branch (a scoped manager) or the first active branch —
  // derived, so viewing never writes state the desktop "All" view would lose.
  const defaultBranch = useMemo(() => {
    if (!requireBranch) return '';
    const own = branches.find((b) => b.id === user?.branchId);
    const first = own ?? branches.find((b) => b.isActive) ?? branches[0];
    return first ? String(first.id) : '';
  }, [requireBranch, branches, user?.branchId]);
  const filterBranch = chosenBranch !== '' ? chosenBranch : defaultBranch;
  const selectedBranchId = useMemo(() => {
    const parsed = Number.parseInt(filterBranch, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }, [filterBranch]);

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
    if (from === filterDateFrom && to === filterDateTo) return;
    confirmDiscard(
      () => { setFilterDateFrom(from); setFilterDateTo(to); },
      // Kept editing: put the date inputs back on the day still shown.
      () => { setDraftFrom(filterDateFrom); setDraftTo(filterDateTo); },
    );
  }, [filterDateFrom, filterDateTo, confirmDiscard]);

  const changeBranch = useCallback((branchId: string) => {
    if (branchId === filterBranch) return;
    confirmDiscard(() => setFilterBranch(branchId));
  }, [filterBranch, confirmDiscard]);

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
        // No leftover: an initialized row is not a count. It opens on the
        // previous close and sells nothing until its leftover is entered.
        .map((p) => ({ branchId, productId: p.id, date: filterDateFrom, quantity: 0, delivery: 0, reject: 0 }));
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
      // Sales moved, so the cash panel's expected figure did too.
      qc.invalidateQueries({ queryKey: BRANCH_CASH_KEY });
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

  return {
    today, dateMode, draftFrom, draftTo, filterDateFrom, filterDateTo, filterBranch, selectedBranchId, isRange,
    branches, products, productById, invQuery, summaryQuery, rows, displayRows, rowsByType, uninitializedCount,
    bulkCreateMutation, pendingUpdates, handleCellChange, discardPending, savePendingMutation, totalPending,
    isEditable, canAdjust, canEditInventory, canCreateInventory, canImport, canSeeCash, canSeeRevenue,
    commitDates, changeBranch, stepDate, handleDateModeChange, setDraftFrom, setDraftTo,
    adjRow, setAdjRow, discardDialog, confirmDiscard,
  };
}

export type InventoryDay = ReturnType<typeof useInventoryDay>;
