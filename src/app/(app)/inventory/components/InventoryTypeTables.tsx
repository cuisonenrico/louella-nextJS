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
    (hasBranchFilter ? 1 : 0) + // Adjustments
    (!isRange ? 2 : 0) + // Total Stock, Stock ₱
    1 + // Leftover
    1 + // Reject
    1 + // Sold
    (showRevenue ? 1 : 0); // Revenue

  return (
    <Table containerClassName={SHEET_CONTAINER} className={SHEET_TABLE}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(SHEET_HEAD, 'sticky left-0 z-30 text-left min-w-[140px]')}>Product</TableHead>
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Prev. Leftover</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Delivery</TableHead>
          {hasBranchFilter && <TableHead className={cn(SHEET_HEAD, 'text-center w-[110px]')}>Adjustments</TableHead>}
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Total Stock</TableHead>}
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Stock ₱</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Leftover</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[80px]')}>Reject</TableHead>
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
                leadingColumns={columnCount - 1 - 1 - (showRevenue ? 1 : 0)}
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
 * A category's sold and revenue, summed from the same per-row figures the rows
 * show (unsaved edits included), so the subtotal always matches what is above it.
 */
function SubtotalRow({
  label,
  rows,
  productById,
  pendingUpdates,
  leadingColumns,
  showRevenue,
}: {
  label: string;
  rows: Inventory[];
  productById: Map<number, Product>;
  pendingUpdates: Map<number, Partial<Inventory>>;
  /** Columns between Product and Sold. */
  leadingColumns: number;
  showRevenue: boolean;
}) {
  let sold = 0;
  let centavos = 0;
  for (const inv of rows) {
    const f = rowFigures(inv, pendingUpdates.get(inv.id), productById.get(inv.productId));
    sold += f.sold;
    centavos += Math.round(f.revenue * 100);
  }
  const revenue = centavos / 100;

  return (
    <TableRow className="bg-accent text-accent-foreground hover:bg-accent">
      <TableCell className={cn(SUBTOTAL_CELL, 'sticky left-0 z-10 bg-accent px-2 text-left text-xs font-bold uppercase tracking-wider')}>
        {label} subtotal
      </TableCell>
      {leadingColumns > 0 && <TableCell colSpan={leadingColumns} className={SUBTOTAL_CELL} />}
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
