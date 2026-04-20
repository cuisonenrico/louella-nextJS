import type { Inventory, Product } from '@/types';

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

export function getAdjSum(inv: Inventory): number {
  return (inv.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
}

export function getSold(inv: Inventory, productById: Map<number, Product>): number {
  const adjSum = getAdjSum(inv);
  return inv.quantity + inv.delivery + adjSum - inv.leftover;
}

export function getRevenue(inv: Inventory, productById: Map<number, Product>): number {
  const sold = getSold(inv, productById);
  const price = inv.effectivePrice ?? productById.get(inv.productId)?.price ?? 0;
  return sold * price;
}

export function getTotalStock(inv: Inventory): number {
  const adjSum = getAdjSum(inv);
  return inv.quantity + inv.delivery + adjSum;
}
