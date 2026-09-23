import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';
import ChangeHistory from './ChangeHistory';
import type { AuditEvent } from '@/types';

const events: AuditEvent[] = [
  {
    id: 2,
    entity: 'Inventory',
    entityId: 5,
    action: 'carry-forward',
    changes: { quantity: [20, 18] },
    at: '2026-09-23T02:00:00Z',
    user: { id: 4, email: 'ana@louella.test' },
  },
  {
    id: 1,
    entity: 'Inventory',
    entityId: 5,
    action: 'update',
    changes: { leftover: [20, 18], notes: [null, 'recount'] },
    at: '2026-09-23T01:00:00Z',
    user: null,
  },
];

describe('ChangeHistory', () => {
  it('loads only when opened, then shows each change from → to, with who made it', async () => {
    const load = vi.fn().mockResolvedValue(events);
    renderWithQuery(<ChangeHistory queryKey={['inventory', 5]} load={load} />);

    expect(load).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /change history/i }));

    expect(await screen.findByText('Carried forward')).toBeInTheDocument();
    expect(screen.getByText(/Opening: 20 →/)).toBeInTheDocument();
    expect(screen.getByText(/Leftover: 20 →/)).toBeInTheDocument();
    expect(screen.getByText(/Notes: — →/)).toBeInTheDocument();
    expect(screen.getByText(/ana@louella\.test/)).toBeInTheDocument();
    expect(screen.getByText(/system/)).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('says so when nothing has been recorded', async () => {
    renderWithQuery(<ChangeHistory queryKey={['inventory', 6]} load={() => Promise.resolve([])} />);

    await userEvent.click(screen.getByRole('button', { name: /change history/i }));

    expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument();
  });
});
