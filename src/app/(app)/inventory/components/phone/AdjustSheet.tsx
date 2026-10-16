'use client';

import { useState } from 'react';
import type { AdjustmentType, Branch, Inventory, Product } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ProductSheet } from '@/components/mobile/ProductSheet';
import { Stepper } from '@/components/mobile/Stepper';
import { rowFigures, type CountFields } from '@/lib/inventory/rowFigures';
import { useOnline } from '@/lib/mobile/useOnline';
import { useInventoryAdjustments } from '../InventoryAdjustmentsDialog';

const TYPES: Array<{ value: AdjustmentType; label: string }> = [
  { value: 'PULL_IN', label: 'Pull In' },
  { value: 'PULL_OUT', label: 'Pull Out' },
  { value: 'ANOMALY', label: 'Anomaly' },
];
// Radix reserves the empty string for "no selection", so "no destination" needs a real value.
const NO_BRANCH = 'none';

interface AdjustSheetProps {
  inv: Inventory;
  product: Product | undefined;
  queued: CountFields | undefined;
  branches: Branch[];
  onBack: () => void;
  onClose: () => void;
}

/**
 * Pull In / Pull Out / Anomaly for one product, in the desktop dialog's terms.
 * A Pull Out with a branch is a transfer: it leaves this count now and reaches
 * the other branch when they accept. Never queued — the server must check the
 * cap and answer, so without signal the button says so.
 */
export default function AdjustSheet({ inv, product, queued, branches, onBack, onClose }: AdjustSheetProps) {
  const online = useOnline();
  const { create, transfer, remove, error, setError, canCreate, canTransfer, canDelete } = useInventoryAdjustments(branches);
  const [type, setType] = useState<AdjustmentType>('PULL_IN');
  const [value, setValue] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [toBranch, setToBranch] = useState(NO_BRANCH);

  const name = product?.name ?? `Product #${inv.productId}`;
  const f = rowFigures(inv, queued, product);
  // The server's pull-out cap: on hand, less rejects and any counted leftover.
  const cap = Math.max(0, f.totalStock - f.reject - (f.uncounted ? 0 : f.leftover));
  const isTransfer = type === 'PULL_OUT' && toBranch !== NO_BRANCH;
  const toName = branches.find((b) => String(b.id) === toBranch)?.name;
  const otherBranches = branches.filter((b) => b.id !== inv.branchId && b.isActive);
  const busy = create.isPending || transfer.isPending;

  const reset = () => {
    setValue(null);
    setNotes('');
    setToBranch(NO_BRANCH);
  };

  const submit = () => {
    if (!value || value <= 0) {
      setError('Enter a quantity above zero.');
      return;
    }
    const note = notes.trim() || undefined;
    if (isTransfer) {
      transfer.mutate({ fromInventoryId: inv.id, toBranchId: Number(toBranch), value, notes: note }, { onSuccess: reset });
    } else {
      create.mutate({ inventoryId: inv.id, type, value, notes: note }, { onSuccess: reset });
    }
  };

  const label = !online ? 'Needs signal' : isTransfer ? `Send ${value ?? 0}` : 'Add';

  return (
    <ProductSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${name} · adjust`}
      subtitle={`On hand ${f.totalStock}`}
      footer={
        <>
          <Button variant="outline" className="h-12" onClick={onBack}>
            Back
          </Button>
          {canCreate ? (
            <Button className="h-12 flex-1" disabled={!online || busy} onClick={submit}>
              {label}
            </Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {canCreate ? (
        <>
          <ToggleGroup
            type="single"
            variant="outline"
            value={type}
            onValueChange={(v) => v && setType(v as AdjustmentType)}
            className="w-full"
          >
            {TYPES.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} className="h-11 flex-1">
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {type === 'PULL_OUT' && canTransfer ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="adjust-to-branch">To branch</Label>
              <Select value={toBranch} onValueChange={setToBranch}>
                <SelectTrigger id="adjust-to-branch" aria-label="To branch" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_BRANCH}>No branch — just pull out</SelectItem>
                    {otherBranches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Quantity</span>
              {type === 'PULL_OUT' ? <span className="text-xs text-muted-foreground">Can send up to {cap}</span> : null}
            </div>
            <Stepper label="Quantity" value={value} onChange={setValue} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="adjust-note">Note</Label>
            <Input
              id="adjust-note"
              className="h-11"
              placeholder={type === 'ANOMALY' ? 'What happened?' : 'Optional'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {isTransfer ? (
            <p className="text-sm text-muted-foreground">Leaves your count now. {toName} gets it once they accept.</p>
          ) : null}
        </>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today on this product</span>
        {(inv.adjustments ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No adjustments yet.</p>
        ) : (
          (inv.adjustments ?? []).map((adj) => (
            <div key={adj.id} className="flex min-h-11 items-center gap-2 border-b text-sm">
              <Badge variant="outline">{TYPES.find((t) => t.value === adj.type)?.label}</Badge>
              <span className="font-semibold tabular-nums">{adj.type === 'PULL_IN' ? `+${adj.value}` : `−${adj.value}`}</span>
              <span className="flex-1 truncate text-muted-foreground">
                {adj.transferStatus === 'PENDING' ? 'Transfer · waiting' : (adj.notes ?? '')}
              </span>
              {adj.transferStatus === 'PENDING' && canDelete ? (
                <Button
                  variant="ghost"
                  className="h-11 text-destructive"
                  disabled={remove.isPending || !online}
                  onClick={() => remove.mutate(adj.id)}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </ProductSheet>
  );
}
