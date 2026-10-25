'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductSheet } from '@/components/mobile/ProductSheet';
import { Stepper } from '@/components/mobile/Stepper';
import type { BoardChange } from '@/lib/mobile/boardQueue';
import { cn } from '@/lib/utils';
import { allocation, startingYield } from '../../lib/allocation';

export interface BoardBranch {
  id: number;
  name: string;
  /** This branch's finalized order quantity for the product. */
  ordered: number;
  /** The branch's inventory row for the day; null until it is initialized. */
  inventoryId: number | null;
  /** The delivery the server has. */
  stored: number;
  /** A delivery still waiting in the phone's queue. */
  queued: number | undefined;
}

export interface BoardSheetProps {
  date: string;
  productId: number;
  productName: string;
  position: { n: number; of: number };
  planned: number;
  storedYield: number;
  queuedYield: number | undefined;
  branches: BoardBranch[];
  editable: boolean;
  onSave: (changes: BoardChange[]) => void;
  onMaterials: (() => void) | undefined;
  onClose: () => void;
}

/**
 * One product on the phone board: its yield and what each branch gets. Remount
 * per product (`key`). Only touched fields are sent, each with the server
 * figure it started from, so the queue can tell when the server moved on.
 */
export default function BoardSheet({
  date, productId, productName, position, planned, storedYield, queuedYield, branches, editable, onSave, onMaterials, onClose,
}: BoardSheetProps) {
  const [yieldEdit, setYieldEdit] = useState<number | undefined>(undefined);
  const [branchEdits, setBranchEdits] = useState<Record<number, number>>({});

  const start = queuedYield !== undefined ? { value: queuedYield, fromPlan: false } : startingYield(storedYield, planned);
  const fromPlan = yieldEdit === undefined && start.fromPlan;
  const yieldVal = yieldEdit ?? start.value;
  const branchValue = (b: BoardBranch) => branchEdits[b.id] ?? b.queued ?? b.stored;
  const { assigned, over } = allocation(yieldVal, branches.filter((b) => b.inventoryId != null).map(branchValue));
  const diff = yieldVal - planned;

  const save = () => {
    const changes: BoardChange[] = [];
    if (yieldEdit !== undefined || fromPlan) {
      changes.push({ kind: 'yield', date, productId, value: yieldVal, base: storedYield });
    }
    for (const b of branches) {
      if (b.inventoryId != null && branchEdits[b.id] !== undefined) {
        changes.push({ kind: 'delivery', date, productId, inventoryId: b.inventoryId, value: branchEdits[b.id], base: b.stored });
      }
    }
    onSave(changes);
  };

  return (
    <ProductSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={productName}
      subtitle={`${position.n} of ${position.of}`}
      footer={
        <>
          {onMaterials ? (
            <Button variant="outline" className="h-12" onClick={onMaterials}>
              Materials
            </Button>
          ) : null}
          {editable ? (
            <Button className="h-12 flex-1" disabled={over} onClick={save}>
              Save &amp; next <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button variant="outline" className="h-12 flex-1" onClick={onClose}>
              Close
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm">
        Planned <span className="text-lg font-semibold tabular-nums">{planned}</span>
      </p>

      {editable ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Yield</span>
          <Stepper
            label="Yield"
            value={yieldVal}
            onChange={(v) => setYieldEdit(v ?? 0)}
          />
          {fromPlan ? <span className="text-xs text-amber-700">From plan — not saved yet</span> : null}
        </div>
      ) : (
        <p className="text-sm">
          Yield <span className="text-lg font-semibold tabular-nums">{yieldVal}</span>
        </p>
      )}

      <p className={cn('text-sm font-medium', diff < 0 ? 'text-amber-700' : diff > 0 ? 'text-green-700' : 'text-muted-foreground')}>
        {diff > 0 ? `${diff} over plan` : diff < 0 ? `${-diff} short of plan` : 'Matches plan'}
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Send to branches</span>
        {branches.map((b) => (
          <div key={b.id} className="flex items-center gap-3">
            <div className="flex w-28 shrink-0 flex-col">
              <span className="truncate font-medium">{b.name}</span>
              <span className="text-xs text-muted-foreground">ordered {b.ordered}</span>
            </div>
            {b.inventoryId == null ? (
              <span className="text-sm text-muted-foreground">Setting up…</span>
            ) : editable ? (
              <Stepper
                label={b.name}
                value={branchValue(b)}
                onChange={(v) => setBranchEdits((e) => ({ ...e, [b.id]: v ?? 0 }))}
                className="flex-1"
              />
            ) : (
              <span className="text-lg font-semibold tabular-nums">{branchValue(b)}</span>
            )}
          </div>
        ))}
      </div>

      <p className={cn('text-sm', over ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
        Assigned {assigned} of {yieldVal}
      </p>
      {over && editable ? <p className="text-sm text-destructive">Lower a branch to match the yield</p> : null}
      {!editable ? (
        <p className="text-sm text-muted-foreground">Only the kitchen changes yield and branch splits.</p>
      ) : null}
    </ProductSheet>
  );
}
