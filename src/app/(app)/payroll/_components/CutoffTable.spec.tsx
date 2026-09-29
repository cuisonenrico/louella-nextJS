import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CutoffTable, type SlipRow } from './CutoffTable';

const row: SlipRow = {
  employeeId: 1,
  employeeName: 'Ana Cruz',
  jobRoleName: 'Baker',
  branchName: null,
  workingDays: 13,
  absenceDays: 0,
  daysWorked: 13,
  basicPay: 7200,
  holidayPay: 1200,
  totalAdditions: 0,
  totalDeductions: 0,
  netPay: 8400,
  lines: [],
  warnings: [{ code: 'IGNORED_REST_DAY_MARK', blocking: false, dates: ['2026-09-08'] }],
};

describe('CutoffTable', () => {
  it('labels an ignored rest-day mark as such, not as "no days worked"', () => {
    render(<CutoffTable rows={[row]} />);
    expect(screen.getAllByText(/rest-day mark ignored/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/no days worked/i)).toBeNull();
  });

  it('shows the holiday pay column', () => {
    render(<CutoffTable rows={[row]} />);
    expect(screen.getByRole('columnheader', { name: 'Holiday' })).toBeInTheDocument();
    expect(screen.getByText('₱1,200.00')).toBeInTheDocument();
  });
});
