'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import QueryError from '@/components/QueryError';
import { TableSkeleton } from '@/components/loading/Skeletons';
import { SyncChip } from '@/components/mobile/SyncChip';
import { useBoardQueue } from '@/lib/mobile/useBoardQueue';
import { manilaToday } from '@/lib/manilaDate';
import { useCan } from '@/lib/rbac/useHasFeature';
import { allocation, startingYield } from '../../lib/allocation';
import { PRODUCT_TYPE_ORDER, useProductionData } from '../../hooks/useProductionData';
import type { ProdRow } from '../../hooks/useProductionRowUpdate';
import MaterialConsumptionDrawer from '../MaterialConsumptionDrawer';
import BoardList, { type BoardRowView } from './BoardList';
import BoardSheet, { type BoardBranch } from './BoardSheet';

/**
 * The production board on a phone: the day's products as a list, one product
 * at a time in a sheet to set its yield and each branch's share. Saves go
 * through the phone's board queue. Only the kitchen — `production:create` with
 * every branch — edits; everyone else reads.
 */
export default function ProductionPhone({ filterDate, setFilterDate }: { filterDate: string; setFilterDate: (d: string) => void }) {
  const { user } = useAuth();
  const canCreate = useCan('production:create');
  const allBranches = useCan('all-branches');
  const editable = canCreate && allBranches;
  const [, setRowError] = useState('');
  const data = useProductionData(filterDate, setRowError);
  const queue = useBoardQueue(user?.id ?? null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [consumption, setConsumption] = useState<{ id: number; planned?: number } | null>(null);
  const today = manilaToday();

  const activeBranches = useMemo(() => data.branches.filter((b) => b.isActive), [data.branches]);

  const branchesFor = useCallback(
    (row: ProdRow): BoardBranch[] =>
      activeBranches
        .map((b) => {
          const inventoryId = (row[`_inv_${b.id}`] as number | null) ?? null;
          return {
            id: b.id,
            name: b.name,
            ordered: data.orderedByProductBranch.get(`${row.productId}:${b.id}`) ?? 0,
            inventoryId,
            stored: (row[`branch_${b.id}`] as number) ?? 0,
            queued: inventoryId != null ? queue.overlayDelivery(inventoryId) : undefined,
          };
        })
        // A reader limited to one branch only has that branch's rows.
        .filter((b) => editable || b.inventoryId != null),
    [activeBranches, data.orderedByProductBranch, queue, editable],
  );

  const view = useCallback(
    (row: ProdRow): BoardRowView => {
      const planned = data.plannedByProduct.get(row.productId) ?? 0;
      const queuedYield = queue.overlayYield(filterDate, row.productId);
      const yieldVal = queuedYield ?? (editable ? startingYield(row.yield, planned).value : row.yield);
      const shares = branchesFor(row)
        .filter((b) => b.inventoryId != null)
        .map((b) => b.queued ?? b.stored);
      const { assigned, over } = allocation(yieldVal, shares);
      return {
        row,
        name: data.productById.get(row.productId)?.name ?? `Product #${row.productId}`,
        planned,
        yieldVal,
        assigned,
        over,
        branchesWithShare: shares.filter((s) => s > 0).length,
      };
    },
    [data.plannedByProduct, data.productById, queue, filterDate, editable, branchesFor],
  );

  const ordering = useMemo(() => PRODUCT_TYPE_ORDER.flatMap((t) => data.rowsByType.get(t) ?? []), [data.rowsByType]);
  const withYield = ordering.filter((r) => view(r).yieldVal > 0).length;
  const openIndex = ordering.findIndex((r) => r.productId === openId);
  const openRow = openIndex >= 0 ? ordering[openIndex] : null;

  const nameOf = (key: string) => {
    const e = queue.entries.find((x) => x.key === key);
    return data.productById.get(e?.productId ?? 0)?.name ?? 'A product from another day';
  };

  const isLoading = data.prodQuery.isLoading || data.invQuery.isLoading;
  const isError = data.prodQuery.isError || data.invQuery.isError;
  const noFinalized =
    !isLoading && data.rawOrders.length > 0 && data.plannedYields.length === 0 && data.allRows.length > 0;

  return (
    <>
      <div className="-mx-4 -mt-4 mb-3 flex items-center gap-1 border-b bg-background px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Previous day"
          onClick={() => setFilterDate(dayjs(filterDate).subtract(1, 'day').format('YYYY-MM-DD'))}
        >
          <ChevronLeft />
        </Button>
        <Button variant="ghost" className="h-11 flex-1 font-semibold" disabled={filterDate === today} onClick={() => setFilterDate(today)}>
          {filterDate === today ? 'Today' : dayjs(filterDate).format('ddd, MMM D')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Next day"
          onClick={() => setFilterDate(dayjs(filterDate).add(1, 'day').format('YYYY-MM-DD'))}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {ordering.length > 0 ? `${withYield} of ${ordering.length} products have yield` : ''}
        </span>
        <SyncChip
          waiting={queue.waiting.length}
          failed={queue.failed.map((e) => ({ key: e.key, label: nameOf(e.key), error: e.error }))}
          persistent={queue.persistent}
          onEdit={(key) => {
            const e = queue.entries.find((x) => x.key === key);
            if (e && e.date === filterDate) setOpenId(e.productId);
          }}
          onDiscard={queue.discard}
        />
      </div>

      {noFinalized ? (
        <Alert className="mb-3">
          <AlertDescription>
            No Branch Orders have been finalized for {dayjs(filterDate).format('MMM D')}, so nothing is planned yet.{' '}
            <Link href="/production/orders" className="font-medium underline">
              Go to Branch Orders →
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <TableSkeleton rows={8} columns={4} className="py-4" />
      ) : isError ? (
        <QueryError
          error={data.prodQuery.error ?? data.invQuery.error}
          onRetry={() => {
            void data.prodQuery.refetch();
            void data.invQuery.refetch();
          }}
        />
      ) : ordering.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No active products found.</p>
      ) : (
        <BoardList rowsByType={data.rowsByType} view={view} onOpen={(row) => setOpenId(row.productId)} />
      )}

      {openRow ? (
        <BoardSheet
          key={openRow.productId}
          date={filterDate}
          productId={openRow.productId}
          productName={view(openRow).name}
          position={{ n: openIndex + 1, of: ordering.length }}
          planned={data.plannedByProduct.get(openRow.productId) ?? 0}
          storedYield={openRow.yield}
          queuedYield={queue.overlayYield(filterDate, openRow.productId)}
          branches={branchesFor(openRow)}
          editable={editable}
          onMaterials={
            openRow._productionId
              ? () => setConsumption({ id: openRow._productionId!, planned: data.plannedByProduct.get(openRow.productId) || undefined })
              : undefined
          }
          onClose={() => setOpenId(null)}
          onSave={(changes) => {
            queue.save(changes);
            setOpenId(ordering[openIndex + 1]?.productId ?? null);
          }}
        />
      ) : null}

      <MaterialConsumptionDrawer
        consumptionId={consumption?.id ?? null}
        plannedYield={consumption?.planned}
        onClose={() => setConsumption(null)}
      />
    </>
  );
}
