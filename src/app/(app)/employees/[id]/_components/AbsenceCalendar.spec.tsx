import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AbsenceCalendar } from './AbsenceCalendar';

function renderCalendar(onToggle = vi.fn()) {
  render(
    <AbsenceCalendar
      month="2026-09"
      restDays={[0]}
      hiredOn="2026-01-05"
      separatedOn={null}
      absences={[{ id: 1, employeeId: 1, date: '2026-09-02', note: null }]}
      lockedPeriodStarts={new Set(['2026-09-01'])}
      onToggle={onToggle}
    />,
  );
  return onToggle;
}

describe('AbsenceCalendar', () => {
  it('does not let a rest day be marked', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: '2026-09-20' })).toBeDisabled();
  });

  it('locks days in a finalized cutoff', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: '2026-09-03' })).toBeDisabled();
  });

  it('shows recorded absences as pressed', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: '2026-09-02' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks an open working day', () => {
    const onToggle = renderCalendar();
    fireEvent.click(screen.getByRole('button', { name: '2026-09-17' }));
    expect(onToggle).toHaveBeenCalledWith('2026-09-17', undefined);
  });

  it('renders every day of the month', () => {
    renderCalendar();
    expect(screen.getByRole('button', { name: '2026-09-30' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '2026-10-01' })).toBeNull();
  });
});
