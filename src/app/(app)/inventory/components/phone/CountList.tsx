'use client';

import { Fragment } from 'react';
import type { Inventory, Product, ProductType } from '@/types';
import { Badge } from '@/components/ui/badge';
import type { RowFigures } from '@/lib/inventory/rowFigures';
import { cn } from '@/lib/utils';

export const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Miscellaneous',
};

const NUM = 'w-11 shrink-0 text-right tabular-nums';
const peso = (n: number) => `₱${n.toLocaleString()}`;

interface CountListProps {
  rowsByType: Map<ProductType, Inventory[]>;
  productById: Map<number, Product>;
  figures: (inv: Inventory) => RowFigures;
  onOpen: (inv: Inventory) => void;
}

/** The whole day at a glance: one 48px row per product, uncounted rows tinted. */
export default function CountList({ rowsByType, productById, figures, onOpen }: CountListProps) {
  return (
    <div className="-mx-4 flex flex-col">
      {PRODUCT_TYPE_ORDER.map((type) => {
        const rows = rowsByType.get(type) ?? [];
        if (rows.length === 0) return null;
        return (
          <Fragment key={type}>
            <div className="flex items-center px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">{TYPE_LABELS[type]}</span>
              <span className={NUM}>Left</span>
              <span className={NUM}>Rej</span>
              <span className={NUM}>Sold</span>
            </div>
            {rows.map((inv) => {
              const f = figures(inv);
              const product = productById.get(inv.productId);
              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => onOpen(inv)}
                  className={cn(
                    'flex min-h-12 items-center gap-1 border-b px-4 py-1.5 text-left active:bg-muted',
                    f.uncounted ? 'bg-amber-50/70' : 'bg-background',
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{product?.name ?? `Product #${inv.productId}`}</span>
                      {f.adjSum !== 0 ? (
                        <Badge variant="outline" className="shrink-0 px-1.5 text-[10px]">
                          {f.adjSum > 0 ? `+${f.adjSum}` : `−${Math.abs(f.adjSum)}`}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      On hand <span data-field="onHand">{f.totalStock}</span> ·{' '}
                      <span data-field="stockValue">{peso(f.stockValue)}</span>
                    </span>
                  </span>
                  <span data-field="leftover" className={cn(NUM, f.uncounted && 'text-muted-foreground')}>
                    {f.uncounted ? '–' : f.leftover}
                  </span>
                  <span data-field="reject" className={NUM}>
                    {f.reject}
                  </span>
                  <span data-field="sold" className={cn(NUM, 'font-semibold', f.uncounted && 'font-normal text-muted-foreground')}>
                    {f.uncounted ? '–' : f.sold}
                  </span>
                </button>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}
