import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CutoffDraft } from '@/types';
import { FinalizeBar } from './FinalizeBar';

function draft(overrides: Partial<CutoffDraft> = {}): CutoffDraft {
  return {
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    payslips: [{} as CutoffDraft['payslips'][number], {} as CutoffDraft['payslips'][number], {} as CutoffDraft['payslips'][number]],
    totals: { employeeCount: 3, netPay: 21500, employerShare: 2850 },
    hasBlocking: false,
    ...overrides,
  };
}

describe('FinalizeBar', () => {
  it('cannot finalize while a blocking warning remains', () => {
    render(<FinalizeBar draft={draft({ hasBlocking: true })} onFinalize={vi.fn()} pending={false} />);
    expect(screen.getByRole('button', { name: 'Finalize payroll' })).toBeDisabled();
    expect(screen.getByText(/resolve the blocking warnings/i)).toBeInTheDocument();
  });

  it('cannot finalize an empty cutoff', () => {
    render(
      <FinalizeBar
        draft={draft({ payslips: [], totals: { employeeCount: 0, netPay: 0, employerShare: 0 } })}
        onFinalize={vi.fn()}
        pending={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Finalize payroll' })).toBeDisabled();
  });

  it('confirms the count and total before finalizing', () => {
    const onFinalize = vi.fn();
    render(<FinalizeBar draft={draft()} onFinalize={onFinalize} pending={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Finalize payroll' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/3 employees/);
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/21,500\.00/);
    expect(onFinalize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Finalize' }));
    expect(onFinalize).toHaveBeenCalledTimes(1);
  });
});
