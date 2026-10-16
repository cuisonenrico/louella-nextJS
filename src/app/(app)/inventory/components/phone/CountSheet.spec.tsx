import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Inventory, Product } from '@/types';
import CountSheet from './CountSheet';

const product = { id: 1, name: 'Pandesal', type: 'BREAD', price: 4 } as Product;
const row = (o: Partial<Inventory> = {}): Inventory => ({
  id: 9, branchId: 1, productId: 1, createdById: null, quantity: 0, delivery: 20, leftover: 0, reject: 0,
  date: '2026-10-16', notes: null, createdAt: '', updatedAt: '', adjustments: [], effectivePrice: 4,
  leftoverCountedAt: null, ...o,
});

function sheet(inv: Inventory, onSave = vi.fn()) {
  const props = {
    product, queued: undefined, ordered: undefined, position: { n: 1, of: 1 },
    editable: true, canSeeRevenue: false, onSave, onClose: vi.fn(),
  };
  const view = render(<CountSheet inv={inv} {...props} />);
  return { onSave, rerender: (next: Inventory) => view.rerender(<CountSheet inv={next} {...props} />) };
}

describe('CountSheet', () => {
  it('never sends back a delivery the server changed while the sheet was open', async () => {
    const { onSave, rerender } = sheet(row({ delivery: 20 }));
    // An order finalized meanwhile: the refetch brings the new delivery into the open sheet.
    rerender(row({ delivery: 25 }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Leftover' }), { target: { value: '3' } });
    await userEvent.click(screen.getByRole('button', { name: /Save & next/ }));
    expect(onSave).toHaveBeenCalledWith({ leftover: 3 });
  });

  it('sends only the fields the person changed', async () => {
    const { onSave } = sheet(row({ leftoverCountedAt: '2026-10-16T10:00:00Z', leftover: 5 }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Reject' }), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: /Save & next/ }));
    expect(onSave).toHaveBeenCalledWith({ reject: 2 });
  });
});
