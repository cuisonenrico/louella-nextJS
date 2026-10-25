import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SyncChip } from './SyncChip';

const base = { onEdit: vi.fn(), onDiscard: vi.fn() };

describe('SyncChip', () => {
  it('says saved when nothing waits', () => {
    render(<SyncChip waiting={0} failed={[]} persistent {...base} />);
    expect(screen.getByRole('status')).toHaveTextContent('● Saved');
  });

  it('counts what waits for signal', () => {
    render(<SyncChip waiting={2} failed={[]} persistent {...base} />);
    expect(screen.getByRole('status')).toHaveTextContent('● 2 waiting for signal');
  });

  it('warns when counts last only until the page closes', () => {
    render(<SyncChip waiting={1} failed={[]} persistent={false} {...base} />);
    expect(screen.getByRole('status')).toHaveTextContent('Kept only until this page closes');
  });

  it('lists refused counts with their reason, and discards one', async () => {
    const onDiscard = vi.fn();
    const onEdit = vi.fn();
    render(
      <SyncChip
        waiting={0}
        failed={[{ key: '8', label: 'Ensaymada', error: 'Bad value' }]}
        persistent
        {...base}
        onEdit={onEdit}
        onDiscard={onDiscard}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /1 couldn't save/ }));
    expect(await screen.findByText('Ensaymada: Bad value')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith('8');
    await userEvent.click(screen.getByRole('button', { name: /1 couldn't save/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledWith('8');
  });
});
