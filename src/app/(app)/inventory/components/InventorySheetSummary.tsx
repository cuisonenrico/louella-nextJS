'use client';

import { useMemo, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { Inventory, InventorySummaryData, Product, ProductType } from '@/types';
import { summarizeSheet, type ProductLine } from '@/lib/inventory/sheetSummary';
import type { CountFields } from '@/lib/inventory/rowFigures';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface InventorySheetSummaryProps {
  /** The raw rows behind the table (not the per-product aggregate it displays). */
  rows: Inventory[];
  pendingUpdates: Map<number, CountFields>;
  productById: Map<number, Product>;
  from: string;
  to: string;
  /** The selected branch's name, or null for all branches. */
  branchName: string | null;
  comparison: InventorySummaryData | undefined;
  comparisonPeriod: { from: string; to: string };
  /** `inventory-history:revenue`: without it no peso figure is shown. */
  showRevenue: boolean;
}

const peso = (n: number) => `₱${n.toLocaleString()}`;
const pcs = (n: number) => `${n.toLocaleString()} pc${Math.abs(n) === 1 ? '' : 's'}`;
const TYPE_LABEL: Record<ProductType, string> = { BREAD: 'Bread', CAKE: 'Cake', SPECIAL: 'Special', MISCELLANEOUS: 'Misc' };
const CHIP_LIMIT = 8;

const lineName = (l: ProductLine) => (l.branchName ? `${l.name} (${l.branchName})` : l.name);

/**
 * The sheet's summary, under the table: what the day (or period) came to, what
 * still needs someone's attention, and which products did well or badly.
 * Worked out from the rows on screen, unsaved edits included, so it always
 * agrees with the table; only the comparison figure comes from the server.
 */
export default function InventorySheetSummary({
  rows,
  pendingUpdates,
  productById,
  from,
  to,
  branchName,
  comparison,
  comparisonPeriod,
  showRevenue,
}: InventorySheetSummaryProps) {
  const s = useMemo(
    () => summarizeSheet(rows, pendingUpdates, productById, { rankByRevenue: showRevenue }),
    [rows, pendingUpdates, productById, showRevenue],
  );

  const isRange = from !== to;
  const dayCount = dayjs(to).diff(dayjs(from), 'day') + 1;
  const title = isRange ? 'Period summary' : 'Day summary';
  const when = isRange
    ? `${dayjs(from).format('D MMM')} – ${dayjs(to).format('D MMM YYYY')} (${dayCount} days)`
    : dayjs(from).format('dddd, D MMM YYYY');
  const versus = isRange ? `previous ${dayCount} days` : dayjs(comparisonPeriod.from).format('ddd D MMM');
  // Nothing recorded then (before the branch opened, say) is no basis for a comparison.
  const baseline = comparison && (comparison.totalSold !== 0 || comparison.totalRevenue !== 0) ? comparison : null;

  const attention = s.uncounted.length + s.overCounted.length + s.equipmentMissing.length > 0;
  const categories = (Object.keys(TYPE_LABEL) as ProductType[]).filter((t) => s.revenueByType[t] !== 0);

  return (
    <section aria-labelledby="sheet-summary-title" className="mt-6 mb-4 rounded-lg border p-4">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="sheet-summary-title" className="text-base font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {branchName ?? 'All branches'} · {when}
          </p>
        </div>
        {pendingUpdates.size > 0 && (
          <p className="text-xs font-medium text-amber-700">Includes unsaved changes</p>
        )}
      </div>

      {/* Headline figures */}
      <div className={cn('grid grid-cols-2 gap-2 mb-4', showRevenue ? 'lg:grid-cols-5 sm:grid-cols-3' : 'sm:grid-cols-4')}>
        {showRevenue && (
          <Tile label="Sales" value={peso(s.revenue)} valueClass="text-green-700">
            {baseline && <Delta now={s.revenue} then={baseline.totalRevenue} versus={versus} money />}
            {s.equipmentCharge > 0 && <span className="block">incl. {peso(s.equipmentCharge)} missing equipment</span>}
          </Tile>
        )}
        <Tile label="Pieces sold" value={s.sold.toLocaleString()}>
          {baseline && <Delta now={s.sold} then={baseline.totalSold} versus={versus} />}
        </Tile>
        <Tile label="Sold of stock" value={s.sellThrough == null ? '—' : `${Math.round(s.sellThrough * 100)}%`}>
          {s.sellThrough == null ? 'nothing counted yet' : 'of what was on hand'}
        </Tile>
        <Tile label="Rejects" value={pcs(s.reject)} valueClass={s.reject > 0 ? 'text-red-600' : undefined}>
          {showRevenue && s.reject > 0 ? `${peso(s.rejectValue)} thrown out` : 'thrown out'}
        </Tile>
        <Tile label="Leftover" value={pcs(s.leftover)} valueClass="text-amber-700">
          {showRevenue && s.leftover > 0 ? `${peso(s.leftoverValue)} · ` : ''}
          {isRange ? 'on hand at the end' : 'carries into tomorrow'}
        </Tile>
      </div>

      {/* What still needs someone */}
      {attention && (
        <div role="region" aria-label="Needs attention" className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-950/20">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Needs attention
          </p>
          <div className="space-y-2">
            {s.uncounted.length > 0 && (
              <Issue
                label="Not counted yet"
                text={`${s.uncounted.length === 1 ? '1 product shows' : `${s.uncounted.length} products show`} 0 sold until a leftover is entered, so sales are not final.`}
                chips={s.uncounted.map(lineName)}
              />
            )}
            {s.overCounted.length > 0 && (
              <Issue
                label="Check these counts"
                text="Leftover and rejects add up to more than the stock on hand. Saving is refused until they are fixed."
                chips={s.overCounted.map((l) => `${lineName(l)}: ${l.sold} sold`)}
              />
            )}
            {s.equipmentMissing.length > 0 && (
              <Issue
                label="Equipment missing"
                text="Counted lower than before; charged to the drawer at the item's price."
                chips={s.equipmentMissing.map((l) => `${lineName(l)}: ${l.sold}${showRevenue ? ` (${peso(l.revenue)})` : ''}`)}
              />
            )}
          </div>
        </div>
      )}

      {/* Products */}
      <div className="grid gap-3 md:grid-cols-3">
        <ProductList
          title="Best sellers"
          empty="Nothing sold yet."
          lines={s.bestSellers}
          value={(l) => (showRevenue ? `${peso(l.revenue)} · ${pcs(l.sold)}` : pcs(l.sold))}
        />
        <ProductList
          title="Slow movers"
          hint="sold under half their stock"
          empty="None: everything counted sold at least half."
          lines={s.slowMovers}
          value={(l) => `${l.sold.toLocaleString()} sold · ${l.leftover.toLocaleString()} left`}
        />
        <ProductList
          title="Most rejected"
          empty="No rejects."
          lines={s.mostRejected}
          value={(l) => (showRevenue ? `${pcs(l.reject)} · ${peso(l.rejectValue)}` : pcs(l.reject))}
        />
      </div>

      {showRevenue && categories.length > 1 && (
        <div role="region" aria-label="Sales by category" className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
          {categories.map((t) => (
            <span key={t}>
              <span className="text-muted-foreground">{TYPE_LABEL[t]}</span>{' '}
              <span className="font-semibold tabular-nums">{peso(s.revenueByType[t])}</span>
              {s.revenue > 0 && (
                <span className="text-muted-foreground"> · {Math.round((s.revenueByType[t] / s.revenue) * 100)}%</span>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, valueClass, children }: { label: string; value: string; valueClass?: string; children?: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-xl font-bold tabular-nums', valueClass)}>{value}</p>
      <div className="mt-0.5 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function Delta({ now, then, versus, money = false }: { now: number; then: number; versus: string; money?: boolean }) {
  const diff = now - then;
  const pct = then !== 0 ? Math.round((diff / Math.abs(then)) * 100) : null;
  const up = diff >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="block">
      <span className={cn('inline-flex items-center font-semibold', up ? 'text-green-700' : 'text-red-600')}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {pct != null ? `${Math.abs(pct)}%` : money ? peso(Math.abs(diff)) : Math.abs(diff).toLocaleString()}
      </span>{' '}
      vs {versus} ({money ? peso(then) : then.toLocaleString()})
    </span>
  );
}

function Issue({ label, text, chips }: { label: string; text: string; chips: string[] }) {
  const shown = chips.slice(0, CHIP_LIMIT);
  return (
    <div role="group" aria-label={label}>
      <p className="text-sm">
        <span className="font-semibold">{label}:</span> {text}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {shown.map((c, i) => (
          <Badge key={`${c}-${i}`} variant="outline" className="border-amber-400 bg-background text-amber-800 dark:text-amber-300">
            {c}
          </Badge>
        ))}
        {chips.length > shown.length && (
          <span className="text-xs text-muted-foreground self-center">+{chips.length - shown.length} more</span>
        )}
      </div>
    </div>
  );
}

function ProductList({
  title,
  hint,
  empty,
  lines,
  value,
}: {
  title: string;
  hint?: string;
  empty: string;
  lines: ProductLine[];
  value: (l: ProductLine) => string;
}) {
  return (
    <section aria-label={title} className="rounded-lg border p-3">
      <p className="text-sm font-semibold">
        {title}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">({hint})</span>}
      </p>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-1 space-y-1 text-sm">
          {lines.map((l, i) => (
            <li key={`${l.productId}-${l.branchName ?? ''}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>
                {lineName(l)}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{value(l)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
