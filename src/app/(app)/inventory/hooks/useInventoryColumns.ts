import type { Inventory, Product } from '@/types';
import {
  computeAdjSum,
  computeSold,
  computeTotalStock,
} from '@/lib/inventory/metrics';

export interface InventoryColumn {
  field: string;
  headerName: string;
  editable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface UseInventoryColumnsParams {
  filterBranch: string;
  isRange: boolean;
}

export function useInventoryColumns({ filterBranch, isRange }: UseInventoryColumnsParams): InventoryColumn[] {
  const cols: InventoryColumn[] = [
    { field: 'productId', headerName: 'Product', align: 'left', width: 'flex-1 min-w-[120px]' },
  ];

  if (!isRange) {
    cols.push({ field: 'quantity', headerName: 'Prev. Leftover', align: 'center', width: 'w-[100px]' });
  }

  cols.push({ field: 'delivery', headerName: 'Delivery', editable: true, align: 'center', width: 'w-[90px]' });

  if (filterBranch !== '') {
    cols.push({ field: 'adjustments', headerName: 'Adjustments', align: 'center', width: 'w-[110px]' });
  }

  if (!isRange) {
    cols.push({ field: 'totalStock', headerName: 'Total Stock', align: 'center', width: 'w-[100px]' });
  }

  cols.push(
    { field: 'leftover', headerName: 'Leftover', editable: true, align: 'center', width: 'w-[90px]' },
    { field: 'reject', headerName: 'Reject', editable: true, align: 'center', width: 'w-[80px]' },
    { field: 'sold', headerName: 'Sold', align: 'center', width: 'w-[80px]' },
    { field: 'revenue', headerName: 'Revenue', align: 'right', width: 'w-[110px]' },
  );

  return cols;
}

// These were hand-written copies of the server's computeSold/computeAdjSum, and
// they had drifted: this file read `inv.reject` unguarded where the server
// defaults it to 0, so a row without the field made sold, revenue and every
// total NaN. There is one definition now, in src/lib/inventory/metrics.
export function getAdjSum(inv: Inventory): number {
  return computeAdjSum(inv.adjustments);
}

export function getSold(inv: Inventory, _productById: Map<number, Product>): number {
  return computeSold(inv);
}

export function getRevenue(inv: Inventory, productById: Map<number, Product>): number {
  const sold = getSold(inv, productById);
  const price = inv.effectivePrice ?? productById.get(inv.productId)?.price ?? 0;
  return sold * price;
}

export function getTotalStock(inv: Inventory): number {
  return computeTotalStock(inv);
}
