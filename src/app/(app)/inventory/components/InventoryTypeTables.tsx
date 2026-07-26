import { Fragment, useCallback, useMemo } from 'react';
import type { Inventory, Product, ProductType } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useSheetNavigation } from '@/components/sheet/useSheetNavigation';
import { SHEET_BANNER, SHEET_CONTAINER, SHEET_HEAD, SHEET_TABLE } from '@/components/sheet/styles';
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
    (!isRange ? 1 : 0) + // Total Stock
    1 + // Leftover
    1 + // Reject
    1 + // Sold
    1; // Revenue

  return (
    <Table containerClassName={SHEET_CONTAINER} className={SHEET_TABLE}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(SHEET_HEAD, 'text-left min-w-[140px]')}>Product</TableHead>
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Prev. Leftover</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Delivery</TableHead>
          {hasBranchFilter && <TableHead className={cn(SHEET_HEAD, 'text-center w-[110px]')}>Adjustments</TableHead>}
          {!isRange && <TableHead className={cn(SHEET_HEAD, 'text-right w-[100px]')}>Total Stock</TableHead>}
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[90px]')}>Leftover</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[80px]')}>Reject</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'text-center w-[80px]')}>Sold</TableHead>
          <TableHead className={cn(SHEET_HEAD, 'text-right w-[110px]')}>Revenue</TableHead>
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
                  productById={productById}
                  onAdjustmentsOpen={onAdjustmentsOpen}
                  onCellChange={onCellChange}
                  getInputId={getInputId}
                  onMoveInColumn={moveInColumn}
                  onMoveLinear={moveLinear}
                />
              ))}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
