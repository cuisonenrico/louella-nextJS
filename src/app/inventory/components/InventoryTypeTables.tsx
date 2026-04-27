import { useCallback, useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import type { Inventory, Product, ProductType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAdjSum, getRevenue, getSold, getTotalStock } from '../hooks/useInventoryColumns';

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
                  {typeRows.map((inv) => {
                    const product = productById.get(inv.productId);
                    const pending = pendingUpdates.get(inv.id);
                    const effectiveInv = pending ? { ...inv, ...pending } : inv;
                    const adjSum = getAdjSum(effectiveInv);
                    const totalStock = getTotalStock(effectiveInv);
                    const sold = getSold(effectiveInv, productById);
                    const revenue = getRevenue(effectiveInv, productById);
                    const hasPending = !!pending;

                    return (
                      <TableRow key={inv.id} className={hasPending ? 'bg-amber-50/50' : ''}>
                        <TableCell className="font-medium">{product?.name ?? `Product #${inv.productId}`}</TableCell>
                        {!isRange && <TableCell className="text-center">{inv.quantity}</TableCell>}
                        <TableCell className="text-center">
                          {isEditable ? (
                            <Input
                              id={getInputId(inv.id, 'delivery')}
                              type="number"
                              className="w-[70px] h-7 text-center mx-auto"
                              value={String(pending?.delivery ?? inv.delivery)}
                              onChange={(e) => onCellChange(inv.id, 'delivery', Number.parseInt(e.target.value, 10) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleEnterNextInColumn(inv.id, 'delivery');
                                } else if (e.key === 'Tab' && !e.shiftKey) {
                                  const moved = handleTabNextInput(getInputId(inv.id, 'delivery'));
                                  if (moved) e.preventDefault();
                                }
                              }}
                              min={0}
                            />
                          ) : (
                            effectiveInv.delivery
                          )}
                        </TableCell>
                        {hasBranchFilter && (
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(inv.adjustments ?? []).length > 0 && (
                                <span className={`text-xs font-bold ${adjSum > 0 ? 'text-green-600' : adjSum < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                  {adjSum > 0 ? `+${adjSum}` : adjSum}
                                </span>
                              )}
                              {!isRange && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onAdjustmentsOpen(inv)}>
                                      <Settings2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Manage adjustments</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        )}
                        {!isRange && (
                          <TableCell className="text-center font-semibold text-primary">{totalStock}</TableCell>
                        )}
                        <TableCell className="text-center">
                          {isEditable ? (
                            <Input
                              id={getInputId(inv.id, 'leftover')}
                              type="number"
                              className="w-[70px] h-7 text-center mx-auto"
                              value={String(pending?.leftover ?? inv.leftover)}
                              onChange={(e) => onCellChange(inv.id, 'leftover', Number.parseInt(e.target.value, 10) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleEnterNextInColumn(inv.id, 'leftover');
                                } else if (e.key === 'Tab' && !e.shiftKey) {
                                  const moved = handleTabNextInput(getInputId(inv.id, 'leftover'));
                                  if (moved) e.preventDefault();
                                }
                              }}
                              min={0}
                            />
                          ) : (
                            effectiveInv.leftover
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditable ? (
                            <Input
                              id={getInputId(inv.id, 'reject')}
                              type="number"
                              className="w-[70px] h-7 text-center mx-auto"
                              value={String(pending?.reject ?? inv.reject)}
                              onChange={(e) => onCellChange(inv.id, 'reject', Number.parseInt(e.target.value, 10) || 0)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleEnterNextInColumn(inv.id, 'reject');
                                } else if (e.key === 'Tab' && !e.shiftKey) {
                                  const moved = handleTabNextInput(getInputId(inv.id, 'reject'));
                                  if (moved) e.preventDefault();
                                }
                              }}
                              min={0}
                            />
                          ) : (
                            effectiveInv.reject
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={sold > 0 ? 'default' : 'secondary'} className={sold > 0 ? 'bg-green-500' : ''}>
                            {sold}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${revenue > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            ₱{revenue.toLocaleString()}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        );
      })}
    </>
  );
}
