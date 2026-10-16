'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Inventory, Product } from '@/types';
import { Button } from '@/components/ui/button';
import { ProductSheet } from '@/components/mobile/ProductSheet';
import { Stepper } from '@/components/mobile/Stepper';
import { rowFigures, type CountFields } from '@/lib/inventory/rowFigures';
import DeliveryBlock from './DeliveryBlock';

interface CountSheetProps {
  inv: Inventory;
  product: Product | undefined;
  /** Values already waiting in the phone's queue for this row. */
  queued: CountFields | undefined;
  ordered: number | undefined;
  position: { n: number; of: number };
  editable: boolean;
  canSeeRevenue: boolean;
  onSave: (fields: CountFields) => void;
  onAdjust?: () => void;
  onClose: () => void;
}

const peso = (n: number) => `₱${n.toLocaleString()}`;

/**
 * One product's count. Remount it per row (`key={inv.id}`): its fields start
 * from the row as shown, including anything still waiting in the queue.
 */
export default function CountSheet({
  inv, product, queued, ordered, position, editable, canSeeRevenue, onSave, onAdjust, onClose,
}: CountSheetProps) {
  const shown = rowFigures(inv, queued, product);
  const [leftover, setLeftover] = useState<number | null>(shown.uncounted ? null : shown.leftover);
  const [reject, setReject] = useState(shown.reject);
  const [delivery, setDelivery] = useState(shown.delivery);
  const [editingDelivery, setEditingDelivery] = useState(false);

  const live = rowFigures(inv, { ...queued, delivery, reject, ...(leftover !== null && { leftover }) }, product);
  const name = product?.name ?? `Product #${inv.productId}`;

  const save = () => {
    // Only what the person changed. Delivery in particular is never echoed back:
    // an order finalized after this sheet opened adds to it on the server.
    const fields: CountFields = {};
    if (delivery !== shown.delivery) fields.delivery = delivery;
    if (reject !== shown.reject) fields.reject = reject;
    if (leftover !== null && (shown.uncounted || leftover !== shown.leftover)) fields.leftover = leftover;
    onSave(fields);
  };

  return (
    <ProductSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={name}
      subtitle={`${position.n} of ${position.of}`}
      footer={
        editable ? (
          <>
            {onAdjust ? (
              <Button variant="outline" className="h-12" onClick={onAdjust}>
                Adjust…
              </Button>
            ) : null}
            <Button className="h-12 flex-1" onClick={save}>
              Save &amp; next <ChevronRight data-icon="inline-end" />
            </Button>
          </>
        ) : (
          <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <DeliveryBlock
        value={delivery}
        ordered={ordered}
        editing={editingDelivery}
        editable={editable}
        onEdit={() => setEditingDelivery(true)}
        onChange={setDelivery}
      />
      <p className="text-sm text-muted-foreground">
        Open {inv.quantity} + Deliv {delivery}
        {live.adjSum !== 0 ? ` ${live.adjSum > 0 ? '+' : '−'} adj ${Math.abs(live.adjSum)}` : ''} = On hand{' '}
        <span className="font-semibold text-foreground">{live.totalStock}</span> · {peso(live.stockValue)}
      </p>
      {editable ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Leftover</span>
            <Stepper label="Leftover" value={leftover} onChange={setLeftover} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Reject</span>
            <Stepper label="Reject" value={reject} onChange={(v) => setReject(v ?? 0)} />
          </div>
        </div>
      ) : (
        <p className="text-sm">
          Leftover {live.uncounted ? '–' : live.leftover} · Reject {live.reject}
        </p>
      )}
      <p className="text-sm">
        {live.uncounted ? (
          <span className="text-muted-foreground">Not counted yet — enter the leftover to count this day</span>
        ) : (
          <>
            <span className="font-semibold">Sold {live.sold}</span>
            {canSeeRevenue ? <span className="text-muted-foreground"> · {peso(live.revenue)}</span> : null}
          </>
        )}
      </p>
    </ProductSheet>
  );
}
