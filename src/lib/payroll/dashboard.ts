import type { CutoffSummary, DraftPayslip } from '@/types';
import { formatCutoff } from './cutoff';

export interface PayrollYear {
  /** Net pay of finalized and paid runs. */
  netPay: number;
  employerShare: number;
  /** Cutoffs with a run (finalized or paid). */
  finalized: number;
  paid: number;
  /** Cutoffs that have ended (today is past their last day). */
  ended: number;
  /**
   * Ended cutoffs still open: payroll nobody finalized. Only from the first run of
   * the year on (earlier ones predate payroll being kept here), plus the cutoff
   * that has just ended, which is due whatever came before.
   */
  overdue: CutoffSummary[];
  /** Finalized runs not yet marked paid. */
  unpaid: CutoffSummary[];
  /** One bar per cutoff with a run, in date order. */
  trend: Array<{ periodStart: string; label: string; netPay: number; employerShare: number; status: CutoffSummary['status'] }>;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `Nov 1–15` — a cutoff named compactly for a chart axis. */
export function shortCutoffLabel(c: { periodStart: string; periodEnd: string }): string {
  const m = Number(c.periodStart.slice(5, 7));
  return `${SHORT_MONTHS[m - 1]} ${Number(c.periodStart.slice(8))}–${Number(c.periodEnd.slice(8))}`;
}

/**
 * A year of cutoffs read for the payroll dashboard. Money is added in centavos so
 * the totals match the runs to the centavo. `today` is the Manila date.
 */
export function summarizePayrollYear(cutoffs: CutoffSummary[], today: string): PayrollYear {
  let netC = 0;
  let shareC = 0;
  let finalized = 0;
  let paid = 0;
  let ended = 0;
  const overdue: CutoffSummary[] = [];
  const unpaid: CutoffSummary[] = [];
  const trend: PayrollYear['trend'] = [];

  const sorted = [...cutoffs].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const firstRun = sorted.find((c) => c.status !== 'OPEN')?.periodStart;
  const lastEnded = sorted.filter((c) => c.periodEnd < today).at(-1)?.periodStart;
  for (const c of sorted) {
    const hasEnded = c.periodEnd < today;
    if (hasEnded) ended++;
    if (c.status === 'OPEN') {
      if (hasEnded && ((firstRun !== undefined && c.periodStart > firstRun) || c.periodStart === lastEnded)) overdue.push(c);
      continue;
    }
    finalized++;
    if (c.status === 'PAID') paid++;
    else unpaid.push(c);
    netC += Math.round((c.totalNetPay ?? 0) * 100);
    shareC += Math.round((c.totalEmployerShare ?? 0) * 100);
    trend.push({
      periodStart: c.periodStart,
      label: shortCutoffLabel(c),
      netPay: c.totalNetPay ?? 0,
      employerShare: c.totalEmployerShare ?? 0,
      status: c.status,
    });
  }

  return { netPay: netC / 100, employerShare: shareC / 100, finalized, paid, ended, overdue, unpaid, trend };
}

export interface DraftHealth {
  /** Employees whose payslip cannot be finalized (a missing rate). */
  blocking: number;
  /** Employees with a warning worth a look that does not block. */
  review: number;
}

/** How many payslips in a draft need someone before finalizing. */
export function draftHealth(payslips: Pick<DraftPayslip, 'warnings'>[]): DraftHealth {
  let blocking = 0;
  let review = 0;
  for (const p of payslips) {
    if (p.warnings.some((w) => w.blocking)) blocking++;
    else if (p.warnings.length > 0) review++;
  }
  return { blocking, review };
}

/** Days from `today` to the cutoff's last day, both Manila dates; 0 on the last day. */
export function daysLeft(today: string, periodEnd: string): number {
  return Math.max(0, Math.round((Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000));
}

export { formatCutoff };

/** The figures a cutoff's payslips add up to (the rows on screen, filtered or not). */
export interface SlipTotals {
  employees: number;
  basicPay: number;
  holidayPay: number;
  additions: number;
  deductions: number;
  netPay: number;
  employerShare: number;
}

type TotalsRow = {
  basicPay: number;
  holidayPay: number;
  totalAdditions: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerShare?: number;
};

/** Sums payslips in centavos, so a filtered view totals exactly what its rows show. */
export function slipTotals(rows: TotalsRow[]): SlipTotals {
  const c = (n: number | undefined) => Math.round((n ?? 0) * 100);
  const t = { basicPay: 0, holidayPay: 0, additions: 0, deductions: 0, netPay: 0, employerShare: 0 };
  for (const r of rows) {
    t.basicPay += c(r.basicPay);
    t.holidayPay += c(r.holidayPay);
    t.additions += c(r.totalAdditions);
    t.deductions += c(r.totalDeductions);
    t.netPay += c(r.netPay);
    t.employerShare += c(r.totalEmployerShare);
  }
  return {
    employees: rows.length,
    basicPay: t.basicPay / 100,
    holidayPay: t.holidayPay / 100,
    additions: t.additions / 100,
    deductions: t.deductions / 100,
    netPay: t.netPay / 100,
    employerShare: t.employerShare / 100,
  };
}

/** Company filter value for payslips with no company. */
export const NO_COMPANY = '__none__';

type FilterRow = {
  employeeName: string;
  jobRoleName: string;
  branchName: string | null;
  companyName?: string | null;
  warnings?: { code: string }[];
};

/**
 * The payslips a cutoff page shows: a name/role/branch search, one company (or
 * NO_COMPANY), and optionally only those with a warning.
 */
export function filterSlips<T extends FilterRow>(
  rows: T[],
  { query = '', company = '', warningsOnly = false }: { query?: string; company?: string; warningsOnly?: boolean },
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && ![r.employeeName, r.jobRoleName, r.branchName ?? ''].some((s) => s.toLowerCase().includes(q))) return false;
    if (company === NO_COMPANY ? r.companyName != null : company && r.companyName !== company) return false;
    if (warningsOnly && !(r.warnings?.length)) return false;
    return true;
  });
}
