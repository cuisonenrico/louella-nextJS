'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { Inventory, ProductionOrder } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { productionOrdersApi } from '@/lib/apiServices';
import { useCan } from '@/lib/rbac/useHasFeature';
import { rowFigures } from '@/lib/inventory/rowFigures';
import { useCountQueue } from '@/lib/mobile/useCountQueue';
import { orderedByProduct } from '@/app/(app)/production-orders/lib/orderedByProduct';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import QueryError from '@/components/QueryError';
import { TableSkeleton } from '@/components/loading/Skeletons';
import { SyncChip } from '@/components/mobile/SyncChip';
import type { InventoryDay } from '../../hooks/useInventoryDay';
import CountList, { PRODUCT_TYPE_ORDER } from './CountList';
import AdjustSheet from './AdjustSheet';
import CountSheet from './CountSheet';
import IncomingTransfers from './IncomingTransfers';
import PhoneDayBar from './PhoneDayBar';

/**
 * The daily count on a phone: the whole day as a short list, and one product
 * at a time in a bottom sheet. Saves go through the phone's queue, so a
 * dropped signal never loses a count.
 */
export default function InventoryPhone({ day }: { day: InventoryDay }) {
  const { user } = useAuth();
  const queue = useCountQueue(user?.id ?? null);
  const canSeeOrders = useCan('production-orders');
  const canAdjust = useCan('inventory-adjustments:create');
  const [openId, setOpenId] = useState<number | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const open = (id: number | null) => {
    setAdjusting(false);
    setOpenId(id);
  };

  const branchId = day.selectedBranchId;
  const date = day.filterDateFrom;

  const ordersQuery = useQuery<ProductionOrder[]>({
    queryKey: ['production-orders', date, branchId],
    queryFn: () => productionOrdersApi.byDate(date, branchId ?? undefined).then((r) => r.data),
    enabled: canSeeOrders && branchId != null,
  });
  const ordered = useMemo(() => orderedByProduct(ordersQuery.data ?? []), [ordersQuery.data]);

  const ordering = useMemo(
    () => PRODUCT_TYPE_ORDER.flatMap((t) => day.rowsByType.get(t) ?? []),
    [day.rowsByType],
  );
  const figures = useCallback(
    (inv: Inventory) => rowFigures(inv, queue.overlay.get(inv.id), day.productById.get(inv.productId)),
    [queue.overlay, day.productById],
  );
  const counted = ordering.filter((inv) => !figures(inv).uncounted).length;

  const openIndex = ordering.findIndex((inv) => inv.id === openId);
  const openInv = openIndex >= 0 ? ordering[openIndex] : null;
  const productName = (inventoryId: number) => {
    const inv = day.rows.find((r) => r.id === inventoryId);
    return day.productById.get(inv?.productId ?? 0)?.name ?? 'A product from another day';
  };

  return (
    <>
      <PhoneDayBar day={day} />

      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {ordering.length > 0 ? `${counted} of ${ordering.length} counted` : ''}
        </span>
        <SyncChip
          waiting={queue.waiting.length}
          failed={queue.failed.map((e) => ({ key: String(e.inventoryId), label: productName(e.inventoryId), error: e.error }))}
          persistent={queue.persistent}
          onEdit={(key) => (ordering.some((r) => r.id === Number(key)) ? open(Number(key)) : undefined)}
          onDiscard={(key) => queue.discard(Number(key))}
        />
      </div>

      <IncomingTransfers branchId={branchId} />

      {day.canCreateInventory && day.uninitializedCount > 0 ? (
        <div className="mb-3 flex flex-col gap-2 rounded-lg bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">
            {day.uninitializedCount} product{day.uninitializedCount === 1 ? '' : 's'} not yet started for this day.
          </span>
          <Button className="h-11" onClick={() => day.bulkCreateMutation.mutate()} disabled={day.bulkCreateMutation.isPending}>
            {day.bulkCreateMutation.isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            Initialize {day.uninitializedCount} row{day.uninitializedCount === 1 ? '' : 's'}
          </Button>
        </div>
      ) : null}

      {day.invQuery.isError && day.invQuery.data ? (
        <Alert className="mb-2">
          <AlertDescription>Couldn&apos;t refresh — showing the last figures. Your counts are kept on this phone.</AlertDescription>
        </Alert>
      ) : null}

      {day.invQuery.isError && !day.invQuery.data ? (
        <QueryError error={day.invQuery.error} onRetry={() => day.invQuery.refetch()} className="my-6" />
      ) : day.invQuery.isLoading ? (
        <TableSkeleton rows={8} columns={4} className="py-4" />
      ) : ordering.length === 0 ? (
        day.uninitializedCount > 0 ? null : (
          <p className="py-12 text-center text-muted-foreground">No products for this day.</p>
        )
      ) : (
        <CountList
          rowsByType={day.rowsByType}
          productById={day.productById}
          figures={figures}
          onOpen={(inv) => open(inv.id)}
        />
      )}

      {openInv && adjusting ? (
        <AdjustSheet
          key={'adjust-' + openInv.id}
          inv={openInv}
          product={day.productById.get(openInv.productId)}
          queued={queue.overlay.get(openInv.id)}
          branches={day.branches}
          onBack={() => setAdjusting(false)}
          onClose={() => open(null)}
        />
      ) : openInv ? (
        <CountSheet
          key={openInv.id}
          inv={openInv}
          product={day.productById.get(openInv.productId)}
          queued={queue.overlay.get(openInv.id)}
          ordered={ordered.get(openInv.productId)}
          position={{ n: openIndex + 1, of: ordering.length }}
          editable={day.canEditInventory}
          canSeeRevenue={day.canSeeRevenue}
          onAdjust={canAdjust ? () => setAdjusting(true) : undefined}
          onClose={() => open(null)}
          onSave={(fields) => {
            if (Object.keys(fields).length > 0) queue.save(openInv.id, fields);
            open(ordering[openIndex + 1]?.id ?? null);
          }}
        />
      ) : null}
    </>
  );
}
