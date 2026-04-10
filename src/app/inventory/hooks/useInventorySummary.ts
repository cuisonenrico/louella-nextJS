import { useMemo } from 'react';
import type { Inventory, Product, ProductType } from '@/types';

export interface InventorySummaryData {
  totalRevenue: number;
  totalSold: number;
  totalDelivery: number;
  totalLeftover: number;
  totalReject: number;
  revenueByType: Record<ProductType, number>;
  topProduct: { name: string; revenue: number; sold: number } | null;
  zeroSales: { name: string; revenue: number; sold: number }[];
}

export function useInventorySummary(
  rows: Inventory[],
  products: Product[],
  productById: Map<number, Product>,
): InventorySummaryData | null {
  return useMemo(() => {
    if (rows.length === 0) return null;

    const productPriceMap = new Map(products.map((p) => [p.id, p.price]));
    const productTypeMap = new Map(products.map((p) => [p.id, p.type]));

    let totalRevenue = 0;
    let totalSold = 0;
    let totalDelivery = 0;
    let totalLeftover = 0;
    let totalReject = 0;
    const revenueByType: Record<ProductType, number> = {
      BREAD: 0,
      CAKE: 0,
      SPECIAL: 0,
      MISCELLANEOUS: 0,
    };
    const revenueByProduct = new Map<number, { name: string; revenue: number; sold: number }>();

    for (const inv of rows) {
      const adjSum = (inv.adjustments ?? []).reduce((acc, a) => acc + a.value, 0);
      const sold = inv.quantity + inv.delivery + adjSum - inv.leftover;
      const price = productPriceMap.get(inv.productId) ?? 0;
      const revenue = sold * price;
      const type = productTypeMap.get(inv.productId);
      totalRevenue += revenue;
      totalSold += sold;
      totalDelivery += inv.delivery;
      totalLeftover += inv.leftover;
      totalReject += inv.reject;
      if (type) revenueByType[type] += revenue;
      const prev = revenueByProduct.get(inv.productId);
      revenueByProduct.set(inv.productId, {
        name: productById.get(inv.productId)?.name ?? `#${inv.productId}`,
        revenue: (prev?.revenue ?? 0) + revenue,
        sold: (prev?.sold ?? 0) + sold,
      });
    }

    const sorted = Array.from(revenueByProduct.values()).sort(
      (a, b) => b.revenue - a.revenue,
    );
    const topProduct = sorted[0] ?? null;
    const zeroSales = sorted.filter((r) => r.sold <= 0);

    return {
      totalRevenue,
      totalSold,
      totalDelivery,
      totalLeftover,
      totalReject,
      revenueByType,
      topProduct,
      zeroSales,
    };
  }, [rows, products, productById]);
}
