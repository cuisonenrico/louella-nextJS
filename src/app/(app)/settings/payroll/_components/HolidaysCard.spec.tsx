import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { HolidaysTable } from './HolidaysCard';

const rows = [
  { id: 90, date: '2026-09-08', name: 'Open day', type: 'REGULAR' as const, isClosed: false, locked: false },
  { id: 91, date: '2026-09-01', name: 'Past day', type: 'SPECIAL' as const, isClosed: true, locked: true },
];

function renderTable() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HolidaysTable rows={rows} onEdit={onEdit} onDelete={onDelete} />
    </QueryClientProvider>,
  );
  return { onEdit, onDelete };
}

describe('HolidaysTable', () => {
  it('shows type and open/closed for each holiday', () => {
    renderTable();
    expect(screen.getByText('Open day')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('offers no actions on a holiday in a finalized cutoff', () => {
    renderTable();
    expect(screen.getByRole('button', { name: 'Edit Open day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Past day' })).toBeNull();
    expect(screen.getByLabelText('Past day is in a finalized cutoff')).toBeInTheDocument();
  });
});
