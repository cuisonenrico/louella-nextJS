import { useCallback, useMemo } from 'react';
import type { Inventory, Product, ProductType } from '@/types';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const orderedRowIds = useMemo(
    () =>
      PRODUCT_TYPE_ORDER.flatMap((type) =>
        (rowsByType.get(type) ?? []).map((row) => row.id),
      ),
    [rowsByType],
  );

  const getInputId = useCallback(
    (invId: number, field: EditableField) => `inventory-input-${invId}-${field}`,
    [],
  );

  const linearInputIds = useMemo(
    () =>
      orderedRowIds.flatMap((invId) =>
        EDITABLE_FIELDS.map((field) => getInputId(invId, field)),
      ),
    [orderedRowIds, getInputId],
  );

  const focusInputById = useCallback((inputId: string) => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (!el) return false;
    el.focus();
    el.select();
    return true;
  }, []);

  const handleEnterNextInColumn = useCallback(
    (invId: number, field: EditableField) => {
      const currentRowIndex = orderedRowIds.indexOf(invId);
      if (currentRowIndex === -1) return;

      for (let i = currentRowIndex + 1; i < orderedRowIds.length; i += 1) {
        if (focusInputById(getInputId(orderedRowIds[i], field))) {
          return;
        }
      }
    },
    [orderedRowIds, getInputId, focusInputById],
  );

  const handleTabNextInput = useCallback(
    (currentInputId: string): boolean => {
      const currentIndex = linearInputIds.indexOf(currentInputId);
      if (currentIndex < 0 || currentIndex >= linearInputIds.length - 1) {
        return false;
      }
      return focusInputById(linearInputIds[currentIndex + 1]);
    },
    [linearInputIds, focusInputById],
  );

  return (
    <>
      {PRODUCT_TYPE_ORDER.map((type) => {
        const typeRows = rowsByType.get(type) ?? [];
        if (typeRows.length === 0) return null;

        return (
          <div key={type} className="mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b-2 pb-1 mb-2">
              {TYPE_LABELS[type]}
            </h3>
            <Card className="shadow-none overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="min-w-[120px]">Product</TableHead>
                    {!isRange && <TableHead className="text-center w-[100px]">Prev. Leftover</TableHead>}
                    <TableHead className="text-center w-[90px]">Delivery</TableHead>
                    {hasBranchFilter && <TableHead className="text-center w-[110px]">Adjustments</TableHead>}
                    {!isRange && <TableHead className="text-center w-[100px]">Total Stock</TableHead>}
                    <TableHead className="text-center w-[90px]">Leftover</TableHead>
                    <TableHead className="text-center w-[80px]">Reject</TableHead>
                    <TableHead className="text-center w-[80px]">Sold</TableHead>
                    <TableHead className="text-right w-[110px]">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                      onEnterNextInColumn={handleEnterNextInColumn}
                      onTabNextInput={handleTabNextInput}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        );
      })}
    </>
  );
}
