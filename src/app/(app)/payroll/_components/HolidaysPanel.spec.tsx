import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CutoffHoliday } from '@/types';
import { HolidaysPanel } from './HolidaysPanel';

const open: CutoffHoliday = {
  id: 91, date: '2026-09-06', name: 'Sun holiday', type: 'SPECIAL', isClosed: false,
  restDayEmployees: [
    { employeeId: 1, employeeName: 'Ana Cruz', markId: 5 },
    { employeeId: 2, employeeName: 'Ben Diaz', markId: null },
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
});
