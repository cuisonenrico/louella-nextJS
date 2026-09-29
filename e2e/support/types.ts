/**
 * GET /payroll/cutoffs/:periodStart — payroll-runs.service.ts getCutoff. `run` is only the active
 * (non-voided) run; `draft` is the live draft while the cutoff is OPEN (payroll-draft.service.ts).
 */
export interface DraftPayslip {
  employeeId: number;
  employeeName: string;
  daysWorked: number;
  basicPay: number;
  holidayPay: number;
  totalDeductions: number;
  netPay: number;
}

export interface CutoffDetail {
  periodStart: string;
  periodEnd: string;
  status: 'OPEN' | 'FINALIZED' | 'PAID';
  run: { id: number; status: string; payslips: Array<{ id: number; employeeId: number; netPay: number }> } | null;
  draft: { payslips: DraftPayslip[]; hasBlocking: boolean } | null;
}

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
