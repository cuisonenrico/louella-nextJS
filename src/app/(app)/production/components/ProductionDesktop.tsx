'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { TableSkeleton } from '@/components/loading/Skeletons';
import QueryError from '@/components/QueryError';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useSaveShortcut } from '@/components/sheet/useSaveShortcut';
import { useUnsavedChangesGuard } from '@/components/sheet/useUnsavedChangesGuard';
import { manilaToday } from '@/lib/manilaDate';
import MaterialConsumptionDrawer from './MaterialConsumptionDrawer';
import ProductionDateToolbar from './ProductionDateToolbar';
import ProductionPendingBar from './ProductionPendingBar';
import ProductionSummaryAccordion from './ProductionSummaryAccordion';
import { ProductionSheet } from './ProductionSheet';
import ProductionTabNav from './ProductionTabNav';
import { useProductionRowUpdate, type ProdRow } from '../hooks/useProductionRowUpdate';
import { useProductionSummary } from '../hooks/useProductionSummary';
import { useYieldAutoSync } from '../hooks/useProductionPlannedYield';
import { useProductionData } from '../hooks/useProductionData';

/** The desktop production sheet: staged edits saved together with "Save Changes". */
export default function ProductionDesktop({ filterDate, setFilterDate }: { filterDate: string; setFilterDate: (d: string) => void }) {
  const qc = useQueryClient();
  const [rowError, setRowError] = useState('');
  const [consumptionId, setConsumptionId] = useState<number | null>(null);
  const [consumptionPlannedYield, setConsumptionPlannedYield] = useState<number | undefined>(undefined);

  const {
    branches, productById, prodQuery, invQuery, plannedQuery, rawOrders, plannedYields, plannedByProduct,
    branchesWithNoInventory, allRows, rowsByType, initBranchMutation, initAllBranchesMutation, savePendingMutation,
  } = useProductionData(filterDate, (m) => setRowError(m));

  const { pendingProduction, pendingInventory, handleFieldChange, resetPending, getEffectiveValue } = useProductionRowUpdate();

  useEffect(() => { resetPending(); }, [filterDate, resetPending]);

  // Leaving the board, or changing the day (which resets the edits above),
  // asks before throwing away unsaved cells — auto-synced yields included,
  // since they are unsaved too until Save.
  const { confirmDiscard, dialog: discardDialog } = useUnsavedChangesGuard(
    pendingProduction.size + pendingInventory.size > 0,
  );
  const changeDate = useCallback((next: string) => {
    if (next === filterDate) return;
    confirmDiscard(() => setFilterDate(next));
  }, [filterDate, confirmDiscard, setFilterDate]);

  useYieldAutoSync({
    allRows, plannedByProduct, pendingProduction, handleFieldChange, filterDate,
    plannedReady: plannedQuery.isSuccess && !plannedQuery.isPlaceholderData,
  });

  const discardPending = useCallback(() => {
    resetPending();
    qc.invalidateQueries({ queryKey: ['production'] });
    qc.invalidateQueries({ queryKey: ['inventory-for-production'] });
  }, [resetPending, qc]);

  const summary = useProductionSummary(allRows, branches, productById, plannedByProduct);

  const today = manilaToday();
  const totalPending = pendingProduction.size + pendingInventory.size;
  const isLoading = prodQuery.isLoading || invQuery.isLoading;
  const isError = prodQuery.isError || invQuery.isError;
  const loadError = prodQuery.error ?? invQuery.error;
  const refetchAll = () => { void prodQuery.refetch(); void invQuery.refetch(); };

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
    // getEffectiveValue is a useCallback over exactly pendingProduction and
    // pendingInventory, so depending on it covers both and keeps this honest
    // if the hook ever reads something else.
  }, [allRows, branches, getEffectiveValue]);

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
    <>
        <TooltipProvider>
          <ProductionTabNav />
          <ProductionDateToolbar
            filterDate={filterDate}
            today={today}
            isInvLoading={invQuery.isLoading}
            isInitAllInvPending={initAllBranchesMutation.isPending}
            onDateChange={changeDate}
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
            <TableSkeleton rows={8} columns={6} className="py-4" />
          ) : isError ? (
            <QueryError error={loadError} onRetry={refetchAll} />
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

          {discardDialog}

          <MaterialConsumptionDrawer consumptionId={consumptionId} plannedYield={consumptionPlannedYield} onClose={() => { setConsumptionId(null); setConsumptionPlannedYield(undefined); }} />
        </TooltipProvider>
      </>
  );
}
