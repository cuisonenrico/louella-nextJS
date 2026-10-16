'use client';

import { Loader2, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SmallScreenNotice from '@/components/layout/SmallScreenNotice';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import SheetPendingBar from '@/components/sheet/SheetPendingBar';
import QueryError from '@/components/QueryError';
import { TableSkeleton } from '@/components/loading/Skeletons';
import BranchCashPanel from '@/components/branch-cash/BranchCashPanel';
// import RejectionByProductCard from '@/components/analytics/RejectionByProductCard';
import InventoryFilterBar from './InventoryFilterBar';
import InventorySummaryPanel from './InventorySummaryPanel';
import PendingTransfersPanel from './PendingTransfersPanel';
import InventoryTypeTables from './InventoryTypeTables';
import InventoryAdjustmentsDialog from './InventoryAdjustmentsDialog';
import type { InventoryDay } from '../hooks/useInventoryDay';

/** The desktop sheet: filter bar, summary, per-type grids and the cash panel. */
export default function InventoryDesktop({ day }: { day: InventoryDay }) {
  const router = useRouter();
  const {
    today, dateMode, draftFrom, draftTo, filterDateFrom, filterDateTo, filterBranch, selectedBranchId, isRange,
    branches, productById, invQuery, summaryQuery, rows, displayRows, rowsByType, uninitializedCount,
    bulkCreateMutation, pendingUpdates, handleCellChange, discardPending, savePendingMutation, totalPending,
    isEditable, canAdjust, canCreateInventory, canImport, canSeeCash,
    commitDates, changeBranch, stepDate, handleDateModeChange, setDraftFrom, setDraftTo,
    adjRow, setAdjRow, discardDialog, confirmDiscard,
  } = day;

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
            onBranchChange={changeBranch}
            onImportOpen={canImport ? () => confirmDiscard(() => router.push('/inventory-import')) : undefined}
          />

          <PendingTransfersPanel branchId={selectedBranchId} />

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

          {canSeeCash ? (
            !isRange && selectedBranchId != null ? (
              <BranchCashPanel branchId={selectedBranchId} date={filterDateFrom} />
            ) : (
              <p className="my-4 text-sm text-muted-foreground">
                Select one branch and one day to record expenses, vale and cash, or open{' '}
                <Link href="/branch-cash" className="underline">Cash Reports</Link>.
              </p>
            )
          ) : null}

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

          {discardDialog}
        </TooltipProvider>
      </>
  );
}
