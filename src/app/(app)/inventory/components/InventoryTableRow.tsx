import { Settings2 } from 'lucide-react';
import type { Inventory, Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SheetInput } from '@/components/sheet/SheetInput';
import { SHEET_CELL as CELL } from '@/components/sheet/styles';
import { getAdjSum, getRevenue, getSold, getTotalStock } from '../hooks/useInventoryColumns';

type EditableField = 'delivery' | 'leftover' | 'reject';

interface InventoryTableRowProps {
  inv: Inventory;
  product: Product | undefined;
  pending: Partial<Inventory> | undefined;
  isEditable: boolean;
  isRange: boolean;
  hasBranchFilter: boolean;
  canAdjust: boolean;
  productById: Map<number, Product>;
  onAdjustmentsOpen: (inventory: Inventory) => void;
  onCellChange: (invId: number, field: EditableField, value: number) => void;
  getInputId: (invId: number, field: EditableField) => string;
  /** Move focus to the same field one row away (+1 down, -1 up). */
  onMoveInColumn: (invId: number, field: EditableField, dir: 1 | -1) => void;
  /** Move focus to the next/previous editable cell in linear order; returns whether it moved. */
  onMoveLinear: (currentInputId: string, dir: 1 | -1) => boolean;
}

export function InventoryTableRow({
  inv,
  product,
  pending,
  isEditable,
  isRange,
  hasBranchFilter,
  canAdjust,
  productById,
  onAdjustmentsOpen,
  onCellChange,
  getInputId,
  onMoveInColumn,
  onMoveLinear,
}: InventoryTableRowProps) {
  const effectiveInv = pending ? { ...inv, ...pending } : inv;
  const adjSum = getAdjSum(effectiveInv);
  const totalStock = getTotalStock(effectiveInv);
  const sold = getSold(effectiveInv, productById);
  const revenue = getRevenue(effectiveInv, productById);
  const hasPending = !!pending;

  const editCell = (field: EditableField) => (
    <SheetInput
      id={getInputId(inv.id, field)}
      value={pending?.[field] ?? inv[field]}
      onValueChange={(value) => onCellChange(inv.id, field, value)}
      onColumnMove={(dir) => onMoveInColumn(inv.id, field, dir)}
      onLinearMove={(dir) => onMoveLinear(getInputId(inv.id, field), dir)}
    />
  );

  const numberCell = (field: EditableField) => (
    <TableCell className={cn(CELL, 'p-0')}>
      {isEditable ? editCell(field) : <div className="px-2 text-right tabular-nums">{effectiveInv[field]}</div>}
    </TableCell>
  );

  return (
    <TableRow className={hasPending ? 'bg-amber-50/50' : ''}>
      <TableCell className={cn(CELL, 'px-2 font-medium')}>
        {product?.name ?? `Product #${inv.productId}`}
      </TableCell>
      {!isRange && (
        <TableCell className={cn(CELL, 'px-2 text-right tabular-nums text-muted-foreground')}>
          {inv.quantity}
        </TableCell>
      )}
      {numberCell('delivery')}
      {hasBranchFilter && (
        <TableCell className={cn(CELL, 'px-2')}>
          <div className="flex items-center justify-center gap-1">
            {(inv.adjustments ?? []).length > 0 && (
              <span
                className={cn(
                  'text-xs font-bold tabular-nums',
                  adjSum > 0 ? 'text-green-600' : adjSum < 0 ? 'text-red-600' : 'text-muted-foreground',
                )}
              >
                {adjSum > 0 ? `+${adjSum}` : adjSum}
              </span>
            )}
            {!isRange && canAdjust && (
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
        <TableCell className={cn(CELL, 'px-2 text-right font-semibold tabular-nums text-primary')}>
          {totalStock}
        </TableCell>
      )}
      {numberCell('leftover')}
      {numberCell('reject')}
      <TableCell className={cn(CELL, 'px-2 text-center')}>
        <Badge variant={sold > 0 ? 'default' : 'secondary'} className={sold > 0 ? 'bg-green-500' : ''}>
          {sold}
        </Badge>
      </TableCell>
      <TableCell className={cn(CELL, 'px-2 text-right')}>
        <span className={cn('font-semibold tabular-nums', revenue > 0 ? 'text-green-600' : 'text-muted-foreground')}>
          ₱{revenue.toLocaleString()}
        </span>
      </TableCell>
    </TableRow>
  );
}
