import { describe, expect, it } from 'vitest';
import type { CutoffSummary } from '@/types';
import { NO_COMPANY, daysLeft, draftHealth, filterSlips, shortCutoffLabel, slipTotals, summarizePayrollYear } from './dashboard';

const cutoff = (periodStart: string, periodEnd: string, o: Partial<CutoffSummary> = {}): CutoffSummary => ({
  periodStart,
  periodEnd,
  status: 'OPEN',
  runId: null,
  employeeCount: null,
  totalNetPay: null,
  totalEmployerShare: null,
  voidedRuns: 0,
  ...o,
});

describe('summarizePayrollYear', () => {
  const year = [
    cutoff('2026-11-16', '2026-11-30'),
    cutoff('2026-10-01', '2026-10-15', { status: 'PAID', runId: 1, totalNetPay: 10_000.1, totalEmployerShare: 500.05 }),
    cutoff('2026-10-16', '2026-10-31', { status: 'FINALIZED', runId: 2, totalNetPay: 9_999.2, totalEmployerShare: 0 }),
    cutoff('2026-11-01', '2026-11-15'),
  ];

  it('totals finalized and paid runs to the centavo', () => {
    const s = summarizePayrollYear(year, '2026-11-21');
    expect(s.netPay).toBe(19_999.3);
    expect(s.employerShare).toBe(500.05);
    expect(s).toMatchObject({ finalized: 2, paid: 1, ended: 3 });
  });

  it('flags ended cutoffs still open, and runs not yet paid', () => {
    const s = summarizePayrollYear(year, '2026-11-21');
    expect(s.overdue.map((c) => c.periodStart)).toEqual(['2026-11-01']);
    expect(s.unpaid.map((c) => c.periodStart)).toEqual(['2026-10-16']);
  });

  it('ignores open cutoffs from before payroll was first run, except the one just ended', () => {
    const early = [cutoff('2026-01-01', '2026-01-15'), cutoff('2026-01-16', '2026-01-31'), ...year];
    expect(summarizePayrollYear(early, '2026-11-21').overdue.map((c) => c.periodStart)).toEqual(['2026-11-01']);
    const none = [cutoff('2026-01-01', '2026-01-15'), cutoff('2026-01-16', '2026-01-31'), cutoff('2026-02-01', '2026-02-15')];
    expect(summarizePayrollYear(none, '2026-02-10').overdue.map((c) => c.periodStart)).toEqual(['2026-01-16']);
  });

  it('the current cutoff is not overdue', () => {
    const s = summarizePayrollYear(year, '2026-11-30');
    expect(s.overdue.map((c) => c.periodStart)).toEqual(['2026-11-01']);
  });

  it('charts runs in date order', () => {
    const s = summarizePayrollYear(year, '2026-11-21');
    expect(s.trend.map((t) => t.label)).toEqual(['Oct 1–15', 'Oct 16–31']);
  });
});

describe('draftHealth', () => {
  it('counts blocking and review warnings per employee', () => {
    expect(
      draftHealth([
        { warnings: [{ code: 'MISSING_RATE', blocking: true, dates: ['2026-11-02'] }, { code: 'NO_DAYS_WORKED', blocking: false }] },
        { warnings: [{ code: 'NEGATIVE_NET', blocking: false }] },
        { warnings: [] },
      ]),
    ).toEqual({ blocking: 1, review: 1 });
  });
});

describe('helpers', () => {
  it('labels a cutoff compactly', () => {
    expect(shortCutoffLabel({ periodStart: '2026-02-16', periodEnd: '2026-02-28' })).toBe('Feb 16–28');
  });
  it('counts days left to the end of the cutoff', () => {
    expect(daysLeft('2026-11-21', '2026-11-30')).toBe(9);
    expect(daysLeft('2026-11-30', '2026-11-30')).toBe(0);
  });
});

describe('cutoff page filters and totals', () => {
  const row = (o: Partial<Parameters<typeof filterSlips>[0][number]> & { netPay?: number } = {}) => ({
    employeeName: 'Ana Reyes',
    jobRoleName: 'Baker',
    branchName: 'Solano',
    companyName: 'Louella Inc',
    warnings: [] as { code: string }[],
    basicPay: 5000,
    holidayPay: 0,
    totalAdditions: 100.1,
    totalDeductions: 50.05,
    netPay: 5050.05,
    totalEmployerShare: 10,
    ...o,
  });

  it('searches name, role and branch', () => {
    const rows = [row(), row({ employeeName: 'Ben Cruz', jobRoleName: 'Cashier', branchName: 'Bambang' })];
    expect(filterSlips(rows, { query: 'cash' }).map((r) => r.employeeName)).toEqual(['Ben Cruz']);
    expect(filterSlips(rows, { query: 'solano' }).map((r) => r.employeeName)).toEqual(['Ana Reyes']);
  });

  it('filters by company, including no company', () => {
    const rows = [row(), row({ employeeName: 'Ben Cruz', companyName: null })];
    expect(filterSlips(rows, { company: 'Louella Inc' }).map((r) => r.employeeName)).toEqual(['Ana Reyes']);
    expect(filterSlips(rows, { company: NO_COMPANY }).map((r) => r.employeeName)).toEqual(['Ben Cruz']);
  });

  it('keeps only payslips with a warning', () => {
    const rows = [row(), row({ employeeName: 'Ben Cruz', warnings: [{ code: 'NEGATIVE_NET' }] })];
    expect(filterSlips(rows, { warningsOnly: true }).map((r) => r.employeeName)).toEqual(['Ben Cruz']);
  });

  it('totals to the centavo', () => {
    expect(slipTotals([row(), row()])).toEqual({
      employees: 2,
      basicPay: 10000,
      holidayPay: 0,
      additions: 200.2,
      deductions: 100.1,
      netPay: 10100.1,
      employerShare: 20,
    });
  });
});
