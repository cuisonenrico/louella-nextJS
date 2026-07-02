'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { branchesApi, inventoryApi, productionApi, productionOrdersApi, productsApi } from '@/lib/apiServices';
import type { Branch, Inventory, Product, Production, ProductionOrder, ProductType } from '@/types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import MaterialConsumptionDrawer from './components/MaterialConsumptionDrawer';
import ProductionDateToolbar from './components/ProductionDateToolbar';
import ProductionPendingBar from './components/ProductionPendingBar';
import ProductionSummaryAccordion from './components/ProductionSummaryAccordion';
import { ProductionSheet } from './components/ProductionSheet';
import { useProductionRowUpdate, type ProdRow } from './hooks/useProductionRowUpdate';
import { useProductionMutations } from './hooks/useProductionMutations';
import { useProductionSummary } from './hooks/useProductionSummary';
import ProductionTabNav from './components/ProductionTabNav';
import { useSaveShortcut } from '@/components/sheet/useSaveShortcut';
import { buildFinalizedPlannedYields, useYieldAutoSync } from './hooks/useProductionPlannedYield';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];

export default function ProductionPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [rowError, setRowError] = useState('');
  const [consumptionId, setConsumptionId] = useState<number | null>(null);
  const [consumptionPlannedYield, setConsumptionPlannedYield] = useState<number | undefined>(undefined);

  const { data: branches = [] } = useQuery<Branch[]>({ queryKey: ['branches'], queryFn: () => branchesApi.list().then((r) => r.data) });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ['products'], queryFn: () => productsApi.list().then((r) => r.data) });
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const prodQuery = useQuery({
    queryKey: ['production', filterDate],
    queryFn: () => productionApi.byDateRange(filterDate).then((r) => r.data as Production[]),
  });

  const invQuery = useQuery({
    queryKey: ['inventory-for-production', filterDate],
    queryFn: () => inventoryApi.byDateRange(filterDate).then((r) => r.data as Inventory[]),
  });

  const { data: rawOrders = [] } = useQuery<ProductionOrder[]>({
    queryKey: ['planned-yield', filterDate],
    queryFn: () => productionOrdersApi.byDate(filterDate).then((r) => r.data as ProductionOrder[]),
  });

  const plannedYields = useMemo(() => buildFinalizedPlannedYields(rawOrders), [rawOrders]);

  const plannedByProduct = useMemo(
    () => new Map(plannedYields.map((p) => [p.productId, p.plannedYield])),
    [plannedYields],
  );

  const branchesWithNoInventory = useMemo(() => {
    const branchIdsWithRecords = new Set((invQuery.data ?? []).map((inv) => inv.branchId));
    return new Set(branches.filter((b) => !branchIdsWithRecords.has(b.id)).map((b) => b.id));
  }, [invQuery.data, branches]);

  const { pendingProduction, pendingInventory, handleFieldChange, resetPending, getEffectiveValue } = useProductionRowUpdate();

  const { initBranchMutation, initAllBranchesMutation, savePendingMutation } = useProductionMutations({
    filterDate, products, branches, branchesWithNoInventory, onError: setRowError,
  });

  useEffect(() => { resetPending(); }, [filterDate, resetPending]);

  // Auto-init inventory for any branch that doesn't have records yet
  useEffect(() => {
    if (!invQuery.isLoading && !invQuery.isFetching && branchesWithNoInventory.size > 0 && !initAllBranchesMutation.isPending) {
      initAllBranchesMutation.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invQuery.isLoading, invQuery.isFetching, branchesWithNoInventory.size]);

  // Lookup maps
  const productionByProduct = useMemo(
    () => new Map((prodQuery.data ?? []).map((p) => [p.productId, p])),
    [prodQuery.data],
  );

  const inventoryByProductBranch = useMemo(() => {
    const m = new Map<string, Inventory>();
    for (const inv of invQuery.data ?? []) m.set(`${inv.productId}:${inv.branchId}`, inv);
    return m;
  }, [invQuery.data]);

  // One row per active product
  const allRows = useMemo<ProdRow[]>(() => {
    return products.filter((p) => p.isActive).map((p) => {
      const prodRec = productionByProduct.get(p.id);
      const row: ProdRow = { id: p.id, productId: p.id, type: p.type, _productionId: prodRec?.id ?? null, yield: prodRec?.yield ?? 0 };
      for (const b of branches) {
        const inv = inventoryByProductBranch.get(`${p.id}:${b.id}`);
        row[`branch_${b.id}`] = inv?.delivery ?? 0;
        row[`_inv_${b.id}`] = inv?.id ?? null;
      }
      return row;
    });
  }, [products, branches, productionByProduct, inventoryByProductBranch]);

  useYieldAutoSync({ allRows, plannedByProduct, pendingProduction, handleFieldChange, filterDate });

  const rowsByType = useMemo(() => {
    const map = new Map<ProductType, ProdRow[]>(PRODUCT_TYPE_ORDER.map((t) => [t, []]));
    for (const row of allRows) map.get(row.type)?.push(row);
    return map;
  }, [allRows]);

  const discardPending = useCallback(() => {
    resetPending();
    qc.invalidateQueries({ queryKey: ['production'] });
    qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
  }, [resetPending, qc]);

  const summary = useProductionSummary(allRows, branches, productById, plannedByProduct);

  const today = dayjs().format('YYYY-MM-DD');
  const totalPending = pendingProduction.size + pendingInventory.size;
  const isLoading = prodQuery.isLoading || invQuery.isLoading;

  const isRowDirty = (row: ProdRow): boolean => {
    if (pendingProduction.has(row.productId)) return true;
    return branches.some((b) => {
      const invId = row[`_inv_${b.id}`] as number | null;
      return invId != null && pendingInventory.has(invId);
    });
  };

  const overAllocatedByProduct = useMemo(() => {
    const map = new Map<number, { assigned: number; yield: number; overBy: number }>();
    for (const row of allRows) {
      const yieldVal = getEffectiveValue(row, 'yield');
      const assigned = branches.reduce((sum, b) => sum + getEffectiveValue(row, `branch_${b.id}`), 0);
      if (assigned > yieldVal) {
        map.set(row.productId, { assigned, yield: yieldVal, overBy: assigned - yieldVal });
      }
    }
    return map;
  }, [allRows, branches, pendingProduction, pendingInventory]);

  const hasOverAllocation = overAllocatedByProduct.size > 0;

  const savePending = useCallback(() => {
    savePendingMutation.mutate(
      { production: pendingProduction, inventory: pendingInventory },
      { onSuccess: resetPending },
    );
  }, [savePendingMutation, pendingProduction, pendingInventory, resetPending]);

  // Ctrl+S / Cmd+S saves pending edits, matching the Excel workflow the sheet emulates.
  useSaveShortcut(totalPending > 0 && !hasOverAllocation && !savePendingMutation.isPending, savePending);

  return (
    <AuthGuard>
      <AppLayout title="Production">
        <TooltipProvider>
          <ProductionTabNav />
          <ProductionDateToolbar
            filterDate={filterDate}
            today={today}
            isInvLoading={invQuery.isLoading}
            isInitAllInvPending={initAllBranchesMutation.isPending}
            onDateChange={setFilterDate}
          />

          {!prodQuery.isLoading && !invQuery.isLoading && rawOrders.length > 0 && plannedYields.length === 0 && allRows.length > 0 && (
            <Alert className="mb-4">
              <AlertDescription>
                No Branch Orders have been finalized for {dayjs(filterDate).format('MMM D')}. The Production Board will show no planned yield.{' '}
                <Link href="/production/orders" className="font-medium underline">Go to Branch Orders →</Link>
              </AlertDescription>
            </Alert>
          )}

          <ProductionPendingBar
            totalPending={totalPending}
            isSaving={savePendingMutation.isPending}
            isSaveDisabled={hasOverAllocation}
            overAllocatedDetails={
              hasOverAllocation
                ? Array.from(overAllocatedByProduct.entries()).map(([productId, info]) => ({
                    name: productById.get(productId)?.name ?? `Product #${productId}`,
                    overBy: info.overBy,
                  }))
                : undefined
            }
            onDiscard={discardPending}
            onSave={savePending}
          />

          <ProductionSummaryAccordion summary={summary} branches={branches} />

          {/* Continuous production sheet */}
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : allRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No active products found.</p>
          ) : (
            <ProductionSheet
              rowsByType={rowsByType}
              branches={branches}
              branchesWithNoInventory={branchesWithNoInventory}
              overAllocatedByProduct={overAllocatedByProduct}
              plannedByProduct={plannedByProduct}
              productById={productById}
              getEffectiveValue={getEffectiveValue}
              isRowDirty={isRowDirty}
              handleFieldChange={handleFieldChange}
              onConsumptionClick={(id, py) => { setConsumptionId(id); setConsumptionPlannedYield(py); }}
              onInitBranch={(id) => initBranchMutation.mutate(id)}
              isInitBranchPending={(_id) => initBranchMutation.isPending || initAllBranchesMutation.isPending}
            />
          )}

          {/* Error snackbar */}
          {rowError && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
              <Alert variant="destructive" className="shadow-lg">
                <AlertDescription className="flex items-center gap-2">
                  {rowError}
                  <Button variant="ghost" size="sm" onClick={() => setRowError('')}>×</Button>
                </AlertDescription>
              </Alert>
            </div>
          )}

          <MaterialConsumptionDrawer consumptionId={consumptionId} plannedYield={consumptionPlannedYield} onClose={() => { setConsumptionId(null); setConsumptionPlannedYield(undefined); }} />
        </TooltipProvider>
      </AppLayout>
    </AuthGuard>
  );
}
