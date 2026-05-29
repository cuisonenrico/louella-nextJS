import { Settings2 } from 'lucide-react';
import type { Inventory, Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAdjSum, getRevenue, getSold, getTotalStock } from '../hooks/useInventoryColumns';

type EditableField = 'delivery' | 'leftover' | 'reject';

interface InventoryTableRowProps {
  inv: Inventory;
  product: Product | undefined;
  pending: Partial<Inventory> | undefined;
  isEditable: boolean;
  isRange: boolean;
  hasBranchFilter: boolean;
  productById: Map<number, Product>;
  onAdjustmentsOpen: (inventory: Inventory) => void;
  onCellChange: (invId: number, field: EditableField, value: number) => void;
  getInputId: (invId: number, field: EditableField) => string;
  onEnterNextInColumn: (invId: number, field: EditableField) => void;
  onTabNextInput: (currentInputId: string) => boolean;
}

export function InventoryTableRow({
  inv,
  product,
  pending,
  isEditable,
  isRange,
  hasBranchFilter,
  productById,
  onAdjustmentsOpen,
  onCellChange,
  getInputId,
  onEnterNextInColumn,
  onTabNextInput,
}: InventoryTableRowProps) {
  const effectiveInv = pending ? { ...inv, ...pending } : inv;
  const adjSum = getAdjSum(effectiveInv);
  const totalStock = getTotalStock(effectiveInv);
  const sold = getSold(effectiveInv, productById);
  const revenue = getRevenue(effectiveInv, productById);
  const hasPending = !!pending;

  const makeKeyDown = (field: EditableField) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnterNextInColumn(inv.id, field);
    } else if (e.key === 'Tab' && !e.shiftKey) {
      const moved = onTabNextInput(getInputId(inv.id, field));
      if (moved) e.preventDefault();
    }
  };

  return (
    <TableRow className={hasPending ? 'bg-amber-50/50' : ''}>
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
            onKeyDown={makeKeyDown('delivery')}
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
            onKeyDown={makeKeyDown('leftover')}
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
            onKeyDown={makeKeyDown('reject')}
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
}
