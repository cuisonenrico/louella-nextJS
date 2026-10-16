'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Stepper } from '@/components/mobile/Stepper';
import { deliveryStatus } from '@/app/(app)/production-orders/lib/orderedByProduct';
import { cn } from '@/lib/utils';

interface DeliveryBlockProps {
  /** The delivery the sheet will save. */
  value: number;
  /** Σ finalized orders for this product and day; undefined when there are none. */
  ordered: number | undefined;
  editing: boolean;
  editable: boolean;
  onEdit: () => void;
  onChange: (value: number) => void;
}

/**
 * Delivery arrives pre-filled from the day's finalized orders; a manager only
 * touches it when what came off the truck differs. Read-only until they say so.
 */
export default function DeliveryBlock({ value, ordered, editing, editable, onEdit, onChange }: DeliveryBlockProps) {
  const status = deliveryStatus(value, ordered);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Delivery</span>
          <span className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{value}</span>
            {status.kind === 'match' ? <Badge variant="secondary">✓ matches order</Badge> : null}
          </span>
        </div>
        {editable ? (
          <Button variant="link" className="h-11 px-0" onClick={onEdit}>
            {ordered === undefined ? 'Edit' : 'Different count?'}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border p-3', status.kind !== 'match' && 'border-amber-400 bg-amber-50/60')}>
      <span className="text-xs text-muted-foreground">Delivery received</span>
      <div className="flex items-center gap-3">
        <Stepper label="Delivery received" value={value} onChange={(v) => onChange(v ?? 0)} className="flex-1" />
        {ordered !== undefined ? (
          <div className="flex flex-col items-end text-right">
            <span className="text-xs text-muted-foreground">Ordered {ordered}</span>
            {status.kind === 'short' || status.kind === 'over' ? (
              <span className="font-semibold text-amber-700">
                {status.by} {status.kind}
              </span>
            ) : (
              <span className="text-xs">✓ matches order</span>
            )}
          </div>
        ) : null}
      </div>
      {ordered !== undefined && status.kind !== 'match' ? (
        <Button variant="link" className="h-11 self-end px-0" onClick={() => onChange(ordered)}>
          Undo
        </Button>
      ) : null}
    </div>
  );
}
