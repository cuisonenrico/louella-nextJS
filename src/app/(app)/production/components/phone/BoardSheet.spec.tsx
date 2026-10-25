import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BoardSheet, { type BoardSheetProps } from './BoardSheet';

function setup(over: Partial<BoardSheetProps> = {}) {
  const onSave = vi.fn();
  const props: BoardSheetProps = {
    date: '2026-10-25',
    productId: 3,
    productName: 'Buns Big',
    position: { n: 2, of: 24 },
    planned: 13,
    storedYield: 13,
    queuedYield: undefined,
    branches: [
      { id: 1, name: 'C2', ordered: 8, inventoryId: 91, stored: 8, queued: undefined },
      { id: 2, name: 'Calamba', ordered: 5, inventoryId: 92, stored: 5, queued: undefined },
    ],
    editable: true,
    onSave,
    onMaterials: undefined,
    onClose: vi.fn(),
    flagged: undefined,
    ...over,
  };
  const view = render(<BoardSheet {...props} />);
  const rerender = (next: Partial<BoardSheetProps>) => view.rerender(<BoardSheet {...props} {...next} />);
  const save = () => screen.getByRole('button', { name: /Save & next/ });
  const field = (name: string) => screen.getByRole('textbox', { name });
  return { onSave, save, field, rerender };
}

describe('BoardSheet', () => {
  it('blocks Save & next while branches hold more than the yield, until a branch is lowered', async () => {
    const { save, field, onSave } = setup();
    fireEvent.change(field('Yield'), { target: { value: '10' } });
    expect(screen.getByText('Assigned 13 of 10')).toBeInTheDocument();
    expect(screen.getByText('Lower a branch to match the yield')).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(field('Calamba'), { target: { value: '2' } });
    expect(save()).toBeEnabled();
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith([
      { kind: 'yield', date: '2026-10-25', productId: 3, value: 10, base: 13 },
      { kind: 'delivery', date: '2026-10-25', productId: 3, inventoryId: 92, value: 2, base: 5 },
    ]);
  });

  it('sends nothing for fields nobody touched', async () => {
    const { save, onSave } = setup();
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('starts an empty yield from the plan and saves it from a base of 0', async () => {
    const { save, field, onSave } = setup({ storedYield: 0 });
    expect(field('Yield')).toHaveValue('13');
    expect(screen.getByText('From plan — not saved yet')).toBeInTheDocument();
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith([{ kind: 'yield', date: '2026-10-25', productId: 3, value: 13, base: 0 }]);
  });

  it('says how the yield compares with the plan', () => {
    const { field } = setup();
    expect(screen.getByText('Matches plan')).toBeInTheDocument();
    fireEvent.change(field('Yield'), { target: { value: '15' } });
    expect(screen.getByText('2 over plan')).toBeInTheDocument();
  });

  it('is read-only without edit rights', () => {
    setup({ editable: false });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Save & next/ })).toBeNull();
    expect(screen.getByText('Only the kitchen changes yield and branch splits.')).toBeInTheDocument();
    // A branch-scoped reader cannot see the kitchen's yield, so none is shown.
    expect(screen.queryByText(/^Yield/)).toBeNull();
    expect(screen.queryByText(/plan$|Matches plan/)).toBeNull();
    expect(screen.queryByText(/^Assigned/)).toBeNull();
  });

  it('shows a branch without rows yet as setting up', () => {
    setup({ branches: [{ id: 1, name: 'C2', ordered: 8, inventoryId: null, stored: 0, queued: undefined }] });
    expect(screen.getByText('Setting up…')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'C2' })).toBeNull();
  });

  it('checks against the figure the person started from, not one that changed while the sheet was open', async () => {
    const { save, field, onSave, rerender } = setup();
    fireEvent.change(field('Yield'), { target: { value: '14' } });
    fireEvent.change(field('C2'), { target: { value: '9' } });
    // An order finalized meanwhile; the board refetched: yield 13 → 18, C2's delivery 8 → 13.
    rerender({
      storedYield: 18,
      branches: [
        { id: 1, name: 'C2', ordered: 13, inventoryId: 91, stored: 13, queued: undefined },
        { id: 2, name: 'Calamba', ordered: 5, inventoryId: 92, stored: 5, queued: undefined },
      ],
    });
    await userEvent.click(save());
    expect(onSave).toHaveBeenCalledWith([
      { kind: 'yield', date: '2026-10-25', productId: 3, value: 14, base: 13 },
      { kind: 'delivery', date: '2026-10-25', productId: 3, inventoryId: 91, value: 9, base: 8 },
    ]);
  });

  it('says when an earlier save was stopped because the server changed', () => {
    setup({ flagged: 'Changed to 15 on the server — check and save again' });
    expect(screen.getByText('Changed to 15 on the server — check and save again')).toBeInTheDocument();
  });
});
