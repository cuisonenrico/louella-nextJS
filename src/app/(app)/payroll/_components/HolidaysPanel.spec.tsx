import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CutoffHoliday } from '@/types';
import { HolidaysPanel } from './HolidaysPanel';

const open: CutoffHoliday = {
  id: 91, date: '2026-09-06', name: 'Sun holiday', type: 'SPECIAL', isClosed: false,
  restDayEmployees: [
    { employeeId: 1, employeeName: 'Ana Cruz', markId: 5, stale: false },
    { employeeId: 2, employeeName: 'Ben Diaz', markId: null, stale: false },
  ],
};

describe('HolidaysPanel', () => {
  it('renders nothing without holidays', () => {
    const { container } = render(<HolidaysPanel holidays={[]} editable busy={false} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles a rest-day employee’s Worked mark', () => {
    const onToggle = vi.fn();
    render(<HolidaysPanel holidays={[open]} editable busy={false} onToggle={onToggle} />);
    expect(screen.getByRole('switch', { name: 'Ana Cruz worked Sun holiday' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Ben Diaz worked Sun holiday' }));
    expect(onToggle).toHaveBeenCalledWith(open, open.restDayEmployees[1]);
  });

  it('disables the toggles on a closed holiday', () => {
    render(<HolidaysPanel holidays={[{ ...open, isClosed: true }]} editable busy={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Ben Diaz worked Sun holiday' })).toBeDisabled();
  });

  it('disables the toggles on a finalized cutoff', () => {
    render(<HolidaysPanel holidays={[open]} editable={false} busy={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Ben Diaz worked Sun holiday' })).toBeDisabled();
  });

  it('keeps a stale mark enabled on a closed holiday so it can be switched off', () => {
    const onToggle = vi.fn();
    const stale: CutoffHoliday = {
      ...open,
      isClosed: true,
      restDayEmployees: [{ employeeId: 3, employeeName: 'Cy Eco', markId: 9, stale: true }],
    };
    render(<HolidaysPanel holidays={[stale]} editable busy={false} onToggle={onToggle} />);
    const toggle = screen.getByRole('switch', { name: 'Cy Eco worked Sun holiday' });
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
    expect(screen.getByText(/no longer a rest day/i)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(stale, stale.restDayEmployees[0]);
  });

  it('still disables a stale mark when the cutoff itself is finalized or an action is busy', () => {
    const stale: CutoffHoliday = {
      ...open,
      restDayEmployees: [{ employeeId: 3, employeeName: 'Cy Eco', markId: 9, stale: true }],
    };
    const { rerender } = render(<HolidaysPanel holidays={[stale]} editable={false} busy={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Cy Eco worked Sun holiday' })).toBeDisabled();
    rerender(<HolidaysPanel holidays={[stale]} editable busy onToggle={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Cy Eco worked Sun holiday' })).toBeDisabled();
  });
});
