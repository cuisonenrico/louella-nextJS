import { Fragment, useCallback, useMemo } from 'react';
import type { Inventory, Product, ProductType } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSheetNavigation } from '@/components/sheet/useSheetNavigation';
import { SHEET_BANNER, SHEET_CONTAINER, SHEET_HEAD, SHEET_TABLE } from '@/components/sheet/styles';
import { rowFigures } from '@/lib/inventory/rowFigures';
import { InventoryTableRow } from './InventoryTableRow';

const PRODUCT_TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'Bread',
  CAKE: 'Cake',
  SPECIAL: 'Special',
  MISCELLANEOUS: 'Miscellaneous',
};
const EDITABLE_FIELDS = ['delivery', 'leftover', 'reject'] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];
/** The view-only peso columns beside Delivery, Leftover and Reject (single day only, like Stock ₱). */
const PESO_HEAD = 'text-right w-[100px] whitespace-nowrap';

interface InventoryTypeTablesProps {
  rowsByType: Map<ProductType, Inventory[]>;
  productById: Map<number, Product>;
  pendingUpdates: Map<number, Partial<Inventory>>;
  isRange: boolean;
  isEditable: boolean;
  hasBranchFilter: boolean;
  canAdjust: boolean;
  /** `inventory-history:revenue` — branch managers do not get it by default. */
  showRevenue: boolean;
  onAdjustmentsOpen: (inventory: Inventory) => void;
  onCellChange: (invId: number, field: 'delivery' | 'leftover' | 'reject', value: number) => void;
}

export default function InventoryTypeTables({
  rowsByType,
  productById,
  pendingUpdates,
  isRange,
  isEditable,
  hasBranchFilter,
  canAdjust,
  showRevenue,
  onAdjustmentsOpen,
  onCellChange,
}: InventoryTypeTablesProps) {
  // Row order spans every type group, so the cursor flows straight through
  // the section banners as if it were one continuous sheet.
  const orderedRowIds = useMemo(
    () => PRODUCT_TYPE_ORDER.flatMap((type) => (rowsByType.get(type) ?? []).map((row) => row.id)),
    [rowsByType],
  );

  const getInputId = useCallback(
    (invId: number, field: EditableField) => `inventory-input-${invId}-${field}`,
    [],
  );

  const { moveInColumn, moveLinear } = useSheetNavigation(orderedRowIds, EDITABLE_FIELDS, getInputId);

  const columnCount =
    1 + // Product
    (!isRange ? 1 : 0) + // Prev. Leftover
    1 + // Delivery
    (!isRange ? 1 : 0) + // Delivery ₱
    (hasBranchFilter ? 1 : 0) + // Adjustments
    (!isRange ? 2 : 0) + // Total Stock, Stock ₱
    1 + // Leftover
    (!isRange ? 1 : 0) + // Leftover ₱
    1 + // Reject
    (!isRange ? 1 : 0) + // Reject ₱
    1 + // Sold
    (showRevenue ? 1 : 0); // Revenue

  // No wrapping: with the peso columns the sheet is wider than a laptop or tablet, so it
  // scrolls sideways under the frozen Product column instead of squashing rows to two lines.
  return (
    <Table containerClassName={SHEET_CONTAINER} className={cn(SHEET_TABLE, 'whitespace-nowrap')}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(SHEET_HEAD, 'sticky left-0 z-30 text-left min-w-[120px]')}>Product</TableHead>
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Prev. Leftover</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Delivery</TableHead>
          {!isRange && <TableHead className={cn(SHEET_HEAD, PESO_HEAD)}>Delivery ₱</TableHead>}
          {hasBranchFilter && <TableHead className={cn(SHEET_HEAD, 'text-center w-[110px]')}>Adjustments</TableHead>}
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Total Stock</TableHead>}
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Stock ₱</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Leftover</TableHead>
          {!isRange && <TableHead className={cn(SHEET_HEAD, PESO_HEAD)}>Leftover ₱</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[80px]')}>Reject</TableHead>
          {!isRange && <TableHead className={cn(SHEET_HEAD, PESO_HEAD)}>Reject ₱</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-center w-[80px]')}>Sold</TableHead>
          {showRevenue && <TableHead className={cn(SHEET_HEAD, 'text-right w-[110px]')}>Revenue</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {PRODUCT_TYPE_ORDER.map((type) => {
          const typeRows = rowsByType.get(type) ?? [];
          if (typeRows.length === 0) return null;

          return (
            <Fragment key={type}>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className={SHEET_BANNER}>
                  {TYPE_LABELS[type]}
                </TableCell>
              </TableRow>
              {typeRows.map((inv) => (
                <InventoryTableRow
                  key={inv.id}
                  inv={inv}
                  product={productById.get(inv.productId)}
                  pending={pendingUpdates.get(inv.id)}
                  isEditable={isEditable}
                  isRange={isRange}
                  hasBranchFilter={hasBranchFilter}
                  canAdjust={canAdjust}
                  showRevenue={showRevenue}
                  productById={productById}
                  onAdjustmentsOpen={onAdjustmentsOpen}
                  onCellChange={onCellChange}
                  getInputId={getInputId}
                  onMoveInColumn={moveInColumn}
                  onMoveLinear={moveLinear}
                />
              ))}
              <SubtotalRow
                label={TYPE_LABELS[type]}
                rows={typeRows}
                productById={productById}
                pendingUpdates={pendingUpdates}
                isRange={isRange}
                hasBranchFilter={hasBranchFilter}
                showRevenue={showRevenue}
              />
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Ruled like the sheet, but taller and set off by a thick rule above. */
const SUBTOTAL_CELL = 'h-10 p-0 border-t-2 border-t-primary border-b-2 border-b-border border-r border-border last:border-r-0';

/**
 * A category's sold, revenue and the delivery / leftover / reject pesos, summed
 * from the same per-row figures the rows show (unsaved edits included), so the
 * subtotal always matches what is above it.
 */
function SubtotalRow({
  label,
  rows,
  productById,
  pendingUpdates,
  isRange,
  hasBranchFilter,
  showRevenue,
}: {
  label: string;
  rows: Inventory[];
  productById: Map<number, Product>;
  pendingUpdates: Map<number, Partial<Inventory>>;
  isRange: boolean;
  hasBranchFilter: boolean;
  showRevenue: boolean;
}) {
  let sold = 0;
  const cents = { revenue: 0, delivery: 0, leftover: 0, reject: 0 };
  for (const inv of rows) {
    const f = rowFigures(inv, pendingUpdates.get(inv.id), productById.get(inv.productId));
    sold += f.sold;
    cents.revenue += Math.round(f.revenue * 100);
    cents.delivery += Math.round(f.deliveryValue * 100);
    cents.leftover += Math.round(f.leftoverValue * 100);
    cents.reject += Math.round(f.rejectValue * 100);
  }
  const revenue = cents.revenue / 100;
  const blank = (n: number) => (n > 0 ? <TableCell colSpan={n} className={SUBTOTAL_CELL} /> : null);
  const peso = (c: number) =>
    !isRange && (
      <TableCell className={cn(SUBTOTAL_CELL, 'px-2 text-right font-bold tabular-nums')}>₱{(c / 100).toLocaleString()}</TableCell>
    );

  return (
    <TableRow className="bg-accent text-accent-foreground hover:bg-accent">
      <TableCell className={cn(SUBTOTAL_CELL, 'sticky left-0 z-10 bg-accent px-2 text-left text-xs font-bold uppercase tracking-wider')}>
        {label} subtotal
      </TableCell>
      {/* Prev. Leftover, Delivery */}
      {blank((!isRange ? 1 : 0) + 1)}
      {peso(cents.delivery)}
      {/* Adjustments, Total Stock, Stock ₱, Leftover */}
      {blank((hasBranchFilter ? 1 : 0) + (!isRange ? 2 : 0) + 1)}
      {peso(cents.leftover)}
      {/* Reject */}
      {blank(1)}
      {peso(cents.reject)}
      <TableCell className={cn(SUBTOTAL_CELL, 'px-2 text-center')}>
        <Badge
          variant={sold !== 0 ? 'default' : 'secondary'}
          className={cn('px-2.5 text-sm font-bold tabular-nums', sold > 0 ? 'bg-green-600' : sold < 0 ? 'bg-red-600 text-white' : '')}
        >
          {sold}
        </Badge>
      </TableCell>
      {showRevenue && (
        <TableCell className={cn(SUBTOTAL_CELL, 'px-2 text-right text-base font-bold tabular-nums', revenue < 0 && 'text-red-600')}>
          ₱{revenue.toLocaleString()}
        </TableCell>
      )}
    </TableRow>
  );
}
