/** GET /sales/branch/:id/date — shape from src/server/sales/sales.service.ts getByBranchAndDate. */
export interface SalesRow {
  inventoryId: number;
  product: { id: number; name: string };
  quantity: number;
  delivery: number;
  leftover: number;
  reject: number;
  sold: number;
  sales: number;
  settled: boolean;
}

export interface SalesDay {
  branchId: number;
  date: string;
  breakdown: SalesRow[];
  totals: {
    totalSold: number;
    totalSales: number;
    totalDelivery: number;
    totalReject: number;
    settledDays: number;
    unsettledDays: number;
  };
}
