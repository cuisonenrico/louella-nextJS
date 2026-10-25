'use client';

import { Fragment } from 'react';
import type { ProductType } from '@/types';
import { cn } from '@/lib/utils';
import type { ProdRow } from '../../hooks/useProductionRowUpdate';
import { PRODUCT_TYPE_ORDER } from '../../hooks/useProductionData';

const TYPE_LABELS: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Miscellaneous' };
const NUM = 'w-12 shrink-0 text-right tabular-nums';

export interface BoardRowView {
  row: ProdRow;
  name: string;
  planned: number;
  yieldVal: number;
  assigned: number;
  branchesWithShare: number;
  over: boolean;
  /** What the viewer's own branch gets (read-only view). */
  ownShare: number;
}

function secondLine(v: BoardRowView): string {
  if (v.assigned !== v.yieldVal) return `assigned ${v.assigned} of ${v.yieldVal}`;
  return `to ${v.branchesWithShare} branch${v.branchesWithShare === 1 ? '' : 'es'} · all assigned`;
}

/**
 * The day's board at a glance. The kitchen sees planned, yield and the
 * difference; a reader limited to their own branch cannot see the kitchen's
 * yield, so they see planned and what their branch gets.
 */
export default function BoardList({
  rowsByType,
  view,
  onOpen,
  readOnly,
}: {
  rowsByType: Map<ProductType, ProdRow[]>;
  view: (row: ProdRow) => BoardRowView;
  onOpen: (row: ProdRow) => void;
  readOnly: boolean;
}) {
  return (
    <div className="-mx-4 flex flex-col">
      {PRODUCT_TYPE_ORDER.map((type) => {
        const rows = rowsByType.get(type) ?? [];
        if (rows.length === 0) return null;
        return (
          <Fragment key={type}>
            <div className="flex items-center px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">{TYPE_LABELS[type]}</span>
              <span className={NUM}>Planned</span>
              {readOnly ? (
                <span className={NUM}>Yours</span>
              ) : (
                <>
                  <span className={NUM}>Yield</span>
                  <span className={NUM}>Diff</span>
                </>
              )}
            </div>
            {rows.map((row) => {
              const v = view(row);
              const diff = v.yieldVal - v.planned;
              return (
                <button
                  key={row.productId}
                  type="button"
                  onClick={() => onOpen(row)}
                  className={cn(
                    'flex min-h-13 items-center gap-1 border-b px-4 py-1.5 text-left active:bg-muted',
                    !readOnly && v.over ? 'bg-red-50/70' : 'bg-background',
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{v.name}</span>
                    {readOnly ? null : (
                      <span className={cn('text-xs', v.over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                        {secondLine(v)}
                      </span>
                    )}
                  </span>
                  <span data-field="planned" className={NUM}>
                    {v.planned}
                  </span>
                  {readOnly ? (
                    <span data-field="share" className={cn(NUM, 'font-semibold')}>
                      {v.ownShare}
                    </span>
                  ) : (
                    <>
                      <span data-field="yield" className={cn(NUM, 'font-semibold')}>
                        {v.yieldVal}
                      </span>
                      <span
                        data-field="diff"
                        className={cn(NUM, diff > 0 ? 'text-green-700' : diff < 0 ? 'text-amber-700' : 'text-muted-foreground')}
                      >
                        {v.yieldVal === 0 ? '–' : diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : '0'}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
