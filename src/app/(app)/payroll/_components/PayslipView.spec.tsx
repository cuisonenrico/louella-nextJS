import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PayslipRecord } from '@/types';
import { PayslipView } from './PayslipView';

const slip: PayslipRecord = {
  id: 20,
  runId: 3,
  employeeId: 1,
  employeeName: 'Ana Cruz',
  jobRoleName: 'Baker',
  branchName: 'Main',
  workingDays: 13,
  absenceDays: 1,
  daysWorked: 12,
  basicPay: 7200,
  totalAdditions: 1000,
  totalDeductions: 450,
  netPay: 7750,
  totalEmployerShare: 950,
  lines: [
    { type: 'BASIC', label: 'Basic pay', quantity: 12, rate: 600, amount: 7200, sourceType: 'EmployeeRate', sourceId: 10 },
    { type: 'ADDITION', label: 'Mid-year bonus', quantity: null, rate: null, amount: 1000, sourceType: 'PayrollAdjustment', sourceId: 5 },
    { type: 'DEDUCTION', label: 'SSS', quantity: null, rate: null, amount: 450, sourceType: 'RecurringDeduction', sourceId: 31 },
    { type: 'EMPLOYER_SHARE', label: 'SSS (employer share)', quantity: null, rate: null, amount: 950, sourceType: 'RecurringDeduction', sourceId: 31 },
  ],
};

const run = { periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'FINALIZED' as const };

describe('PayslipView', () => {
  it('shows earnings, deductions and net pay for the cutoff', () => {
    render(<PayslipView slip={slip} run={run} />);
    expect(screen.getByText('Sep 1–15, 2026', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/12 days × ₱600\.00/)).toBeInTheDocument();
    expect(screen.getByText('Mid-year bonus')).toBeInTheDocument();
    expect(screen.getByText('SSS')).toBeInTheDocument();
    expect(screen.getByTestId('net-pay')).toHaveTextContent('7,750.00');
  });

  it('keeps the employer share off the employee’s payslip', () => {
    render(<PayslipView slip={slip} run={run} />);
    expect(screen.queryByText(/employer share/i)).toBeNull();
  });

  it('marks a payslip from a voided run as not valid', () => {
    render(<PayslipView slip={slip} run={{ ...run, status: 'VOIDED' }} />);
    expect(screen.getByRole('status')).toHaveTextContent(/voided — not valid for payment/i);
  });

  it('carries no voided banner on a valid run', () => {
    render(<PayslipView slip={slip} run={run} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
