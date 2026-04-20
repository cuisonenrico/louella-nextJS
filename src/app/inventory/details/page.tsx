'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, X, AlertTriangle, Settings2 } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, InventorySummaryData, Product, ProductType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import InventoryFilterBar from '../components/InventoryFilterBar';
import InventorySummaryPanel from '../components/InventorySummaryPanel';
import InventoryAdjustmentsDialog from '../components/InventoryAdjustmentsDialog';
import { useInventoryDisplayRows } from '../hooks/useInventoryDisplayRows';
import { getAdjSum, getRevenue, getSold, getTotalStock } from '../hooks/useInventoryColumns';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function InventoryDetailsPage() {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');

  // Filter state
  const [dateMode, setDateMode] = useState<'date' | 'range'>('date');
  const [draftFrom, setDraftFrom] = useState(today);
  const [draftTo, setDraftTo] = useState(today);
  const [filterDateFrom, setFilterDateFrom] = useState(today);
  const [filterDateTo, setFilterDateTo] = useState(today);
  const [filterBranch, setFilterBranch] = useState('');

  const isRange = filterDateFrom !== filterDateTo;

  // Pending edits
  const [pendingUpdates, setPendingUpdates] = useState<Map<number, Partial<Inventory>>>(new Map());
  const [cascadeWarning, setCascadeWarning] = useState<{ branchId: number; productId: number; fromDate: string } | null>(null);
  const [adjRow, setAdjRow] = useState<Inventory | null>(null);
  const [snackError, setSnackError] = useState('');

  // Queries
  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const invQuery = useQuery<Inventory[]>({
    queryKey: ['inventory', filterDateFrom, filterDateTo, filterBranch],
    queryFn: () => {
      if (filterBranch) {
        return filterDateFrom === filterDateTo
          ? inventoryApi.byBranchDate(parseInt(filterBranch), filterDateFrom).then((r) => r.data)
          : inventoryApi.byBranchDateRange(parseInt(filterBranch), filterDateFrom, filterDateTo).then((r) => r.data);
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
      const branchId = parseInt(filterBranch);
      const existingProductIds = new Set(rows.map((r) => r.productId));
      const payload = products
        .filter((p) => p.isActive && !existingProductIds.has(p.id))
        .map((p) => ({ branchId, productId: p.id, date: filterDateFrom, quantity: 0, delivery: 0, leftover: 0, reject: 0 }));
      return inventoryApi.createBulk(payload);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
    onError: (err) => setSnackError(extractError(err)),
  });

  const reinitializeMutation = useMutation({
    mutationFn: async () => {
      const branchId = parseInt(filterBranch);
      const yesterday = dayjs(filterDateFrom).subtract(1, 'day').format('YYYY-MM-DD');
      const prevRes = await inventoryApi.byBranchDate(branchId, yesterday);
      const prevData = (prevRes.data ?? []) as Inventory[];
      const prevMap = new Map(prevData.map((i) => [i.productId, Math.max(0, i.leftover - i.reject)]));
      const existingProductIds = new Set(rows.map((r) => r.productId));
      const payload = products
        .filter((p) => p.isActive && !existingProductIds.has(p.id))
        .map((p) => ({ branchId, productId: p.id, date: filterDateFrom, quantity: prevMap.get(p.id) ?? 0, delivery: 0, leftover: 0, reject: 0 }));
      if (payload.length > 0) await inventoryApi.createBulk(payload);
      // Update existing rows
      for (const r of rows) {
        const qty = prevMap.get(r.productId) ?? 0;
        await inventoryApi.update(r.id, { quantity: qty, delivery: 0, leftover: 0, reject: 0 });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-summary'] }); },
    onError: (err) => setSnackError(extractError(err)),
  });

  const savePendingMutation = useMutation({
    mutationFn: async () => {
      const ops = Array.from(pendingUpdates.entries()).map(([id, data]) =>
        inventoryApi.update(id, data)
      );
      const results = await Promise.all(ops);
      // Check for cascade warnings
      for (const res of results) {
        const result = res.data;
        if (result && typeof result === 'object' && 'cascadeNeeded' in result && result.cascadeNeeded) {
          setCascadeWarning({ branchId: result.branchId, productId: result.productId, fromDate: result.date });
        }
      }
    },
    onSuccess: () => {
      setPendingUpdates(new Map());
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-summary'] });
    },
    onError: (err) => setSnackError(extractError(err)),
  });

  const recascadeMutation = useMutation({
    mutationFn: (data: { branchId: number; productId: number; fromDate: string }) =>
      inventoryApi.recascade(data.branchId, data.productId, data.fromDate),
    onSuccess: () => {
      setCascadeWarning(null);
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => setSnackError(extractError(err)),
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
            uninitializedCount={uninitializedCount}
            isBulkCreatePending={bulkCreateMutation.isPending}
            isReinitializePending={reinitializeMutation.isPending}
            onDateModeChange={handleDateModeChange}
            onDraftFromChange={setDraftFrom}
            onDraftToChange={setDraftTo}
            onCommitDates={commitDates}
            onStepDate={stepDate}
            onBranchChange={setFilterBranch}
            onImportOpen={() => window.location.href = '/inventory-import'}
            onBulkCreate={() => bulkCreateMutation.mutate()}
            onReinitialize={() => reinitializeMutation.mutate()}
          />

          <InventorySummaryPanel
            summary={summaryQuery.data ?? null}
            filterDateFrom={filterDateFrom}
            filterDateTo={filterDateTo}
          />

          {/* Pending changes bar */}
          {totalPending > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-amber-50 border border-amber-400 rounded-md">
              <p className="text-sm text-amber-800 flex-grow">
                {totalPending} unsaved change{totalPending !== 1 ? 's' : ''}
              </p>
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-700" onClick={discardPending}>
                <X className="h-3.5 w-3.5 mr-1" /> Discard
              </Button>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => savePendingMutation.mutate()} disabled={savePendingMutation.isPending}>
                {savePendingMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save Changes
              </Button>
            </div>
          )}

          {/* Per-type grids */}
          {invQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : displayRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No inventory data. Select a branch and date, or sync products.</p>
          ) : (
            PRODUCT_TYPE_ORDER.map((type) => {
              const typeRows = rowsByType.get(type) ?? [];
              if (typeRows.length === 0) return null;
              return (
                <div key={type} className="mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b-2 pb-1 mb-2">
                    {TYPE_LABELS[type]}
                  </h3>
                  <Card className="shadow-none overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="min-w-[120px]">Product</TableHead>
                          {!isRange && <TableHead className="text-center w-[100px]">Prev. Leftover</TableHead>}
                          <TableHead className="text-center w-[90px]">Delivery</TableHead>
                          {filterBranch !== '' && <TableHead className="text-center w-[110px]">Adjustments</TableHead>}
                          {!isRange && <TableHead className="text-center w-[100px]">Total Stock</TableHead>}
                          <TableHead className="text-center w-[90px]">Leftover</TableHead>
                          <TableHead className="text-center w-[80px]">Reject</TableHead>
                          <TableHead className="text-center w-[80px]">Sold</TableHead>
                          <TableHead className="text-right w-[110px]">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {typeRows.map((inv) => {
                          const product = productById.get(inv.productId);
                          const pending = pendingUpdates.get(inv.id);
                          const effectiveInv = pending ? { ...inv, ...pending } : inv;
                          const adjSum = getAdjSum(effectiveInv);
                          const totalStock = getTotalStock(effectiveInv);
                          const sold = getSold(effectiveInv, productById);
                          const revenue = getRevenue(effectiveInv, productById);
                          const hasPending = !!pending;

                          return (
                            <TableRow key={inv.id} className={hasPending ? 'bg-amber-50/50' : ''}>
                              <TableCell className="font-medium">{product?.name ?? `Product #${inv.productId}`}</TableCell>
                              {!isRange && <TableCell className="text-center">{inv.quantity}</TableCell>}
                              <TableCell className="text-center">
                                {isEditable ? (
                                  <Input
                                    type="number"
                                    className="w-[70px] h-7 text-center mx-auto"
                                    value={String(pending?.delivery ?? inv.delivery)}
                                    onChange={(e) => handleCellChange(inv.id, 'delivery', parseInt(e.target.value) || 0)}
                                    min={0}
                                  />
                                ) : (
                                  effectiveInv.delivery
                                )}
                              </TableCell>
                              {filterBranch !== '' && (
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {(inv.adjustments ?? []).length > 0 && (
                                      <span className={`text-xs font-bold ${adjSum > 0 ? 'text-green-600' : adjSum < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                        {adjSum > 0 ? `+${adjSum}` : adjSum}
                                      </span>
                                    )}
                                    {!isRange && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAdjRow(inv)}>
                                            <Settings2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Manage adjustments</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              {!isRange && (
                                <TableCell className="text-center font-semibold text-primary">{totalStock}</TableCell>
                              )}
                              <TableCell className="text-center">
                                {isEditable ? (
                                  <Input
                                    type="number"
                                    className="w-[70px] h-7 text-center mx-auto"
                                    value={String(pending?.leftover ?? inv.leftover)}
                                    onChange={(e) => handleCellChange(inv.id, 'leftover', parseInt(e.target.value) || 0)}
                                    min={0}
                                  />
                                ) : (
                                  effectiveInv.leftover
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {isEditable ? (
                                  <Input
                                    type="number"
                                    className="w-[70px] h-7 text-center mx-auto"
                                    value={String(pending?.reject ?? inv.reject)}
                                    onChange={(e) => handleCellChange(inv.id, 'reject', parseInt(e.target.value) || 0)}
                                    min={0}
                                  />
                                ) : (
                                  effectiveInv.reject
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant={sold > 0 ? 'default' : 'secondary'} className={sold > 0 ? 'bg-green-500' : ''}>
                                  {sold}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`font-semibold ${revenue > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                  ₱{revenue.toLocaleString()}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              );
            })
          )}

          {/* Error toast */}
          {snackError && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <Alert variant="destructive" className="shadow-lg">
                <AlertDescription className="flex items-center gap-2">
                  {snackError}
                  <Button variant="ghost" size="sm" onClick={() => setSnackError('')}>×</Button>
                </AlertDescription>
              </Alert>
            </div>
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
