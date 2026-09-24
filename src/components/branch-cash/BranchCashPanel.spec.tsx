import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';
import { peso } from '@/lib/payroll/format';
import type { CashDayView } from '@/types';

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = {
  day: vi.fn(),
  categories: vi.fn().mockResolvedValue({ data: [{ id: 2, name: 'Utilities', requiresNote: false, isActive: true, sortOrder: 10 }] }),
  employees: vi.fn().mockResolvedValue({ data: [{ id: 5, name: 'Ana Cruz', branchId: 3 }] }),
  createExpense: vi.fn().mockResolvedValue({ data: {} }),
  createVale: vi.fn().mockResolvedValue({ data: {} }),
  voidExpense: vi.fn().mockResolvedValue({ data: {} }),
  updateExpense: vi.fn().mockResolvedValue({ data: {} }),
  setActualCash: vi.fn().mockResolvedValue({ data: {} }),
  verify: vi.fn().mockResolvedValue({ data: {} }),
  reopen: vi.fn().mockResolvedValue({ data: {} }),
};
vi.mock('@/lib/apiServices', () => ({ branchCashApi: api }));

const { default: BranchCashPanel } = await import('./BranchCashPanel');

function view(over: Partial<CashDayView> = {}): CashDayView {
  return {
    branchId: 3,
    date: '2026-10-01',
    status: 'OPEN',
    verifiedAt: null,
    verifiedBy: null,
    note: null,
    expenses: [{ id: 11, category: { id: 2, name: 'Utilities' }, amount: 850, note: 'LPG' }],
    vale: [{ id: 21, employee: { id: 5, name: 'Ana Cruz' }, amount: 500, note: null }],
    totals: {
      sales: 12450,
      expenses: 850,
      vale: 500,
      expected: 11100,
      actualCash: 11050,
      overShort: -50,
      state: 'SHORT',
      drift: [],
    },
    ...over,
  };
}

const MANAGER = ['branch-cash', 'branch-cash:create', 'branch-cash:edit', 'branch-cash:delete'];

describe('BranchCashPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = MANAGER;
    api.day.mockResolvedValue({ data: view() });
  });

  it('shows the reconciliation and a shortage', async () => {
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    expect(await screen.findByText(peso(11100))).toBeInTheDocument();
    expect(screen.getByText(`Short ${peso(50)}`)).toBeInTheDocument();
    // The note sits in the same line as its category; the name also appears in the vale picker.
    expect(screen.getByText(/LPG/)).toBeInTheDocument();
    expect(screen.getAllByText('Ana Cruz').length).toBeGreaterThan(0);
  });

  it('adds an expense for this branch-day', async () => {
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    const form = await screen.findByTestId('add-expense');
    await within(form).findByRole('option', { name: 'Utilities' }); // categories load after the day
    await userEvent.selectOptions(within(form).getByLabelText('Category'), '2');
    await userEvent.type(within(form).getByLabelText('Amount'), '60');
    await userEvent.click(within(form).getByRole('button', { name: 'Add expense' }));
    await waitFor(() =>
      expect(api.createExpense).toHaveBeenCalledWith(
        { branchId: 3, date: '2026-10-01', categoryId: 2, amount: 60, note: undefined },
        expect.any(String),
      ),
    );
  });

  it('lets a line in a retired category be edited', async () => {
    api.day.mockResolvedValue({
      data: view({ expenses: [{ id: 12, category: { id: 9, name: 'Transport' }, amount: 40, note: null }] }),
    });
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]); // the expense line
    const amount = screen.getAllByLabelText('Amount')[0];
    await userEvent.clear(amount);
    await userEvent.type(amount, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updateExpense).toHaveBeenCalledWith(12, { categoryId: 9, amount: 45, note: null }),
    );
  });

  it('saves a counted cash of zero however it is typed', async () => {
    api.day.mockResolvedValue({ data: view({ totals: { ...view().totals, actualCash: null, overShort: null, state: 'NOT_COUNTED' } }) });
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    const input = await screen.findByLabelText('Counted cash');
    await userEvent.type(input, '0.00');
    await userEvent.tab();
    await waitFor(() =>
      expect(api.setActualCash).toHaveBeenCalledWith({ branchId: 3, date: '2026-10-01', actualCash: 0 }),
    );
  });

  it('hides the verify button from managers', async () => {
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    await screen.findByText(peso(11100));
    expect(screen.queryByRole('button', { name: 'Verify day' })).toBeNull();
  });

  it('is read-only once verified, and flags sales drift', async () => {
    auth.permissions = [...MANAGER, 'branch-cash:verify'];
    api.day.mockResolvedValue({
      data: view({
        status: 'VERIFIED',
        verifiedBy: 'admin@louella.ph',
        verifiedAt: '2026-10-02T02:00:00.000Z',
        totals: { ...view().totals, drift: [{ field: 'sales', atVerify: 12450, now: 12510 }] },
      }),
    });
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    expect(await screen.findByText(/Verified by admin@louella.ph/)).toBeInTheDocument();
    expect(screen.queryByTestId('add-expense')).toBeNull();
    expect(screen.getByText(`Sales changed since verification: ${peso(12450)} → ${peso(12510)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(api.reopen).toHaveBeenCalledWith(3, '2026-10-01'));
  });

  it('saves the counted cash on blur', async () => {
    api.day.mockResolvedValue({ data: view({ totals: { ...view().totals, actualCash: null, overShort: null, state: 'NOT_COUNTED' } }) });
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    const input = await screen.findByLabelText('Counted cash');
    await userEvent.type(input, '11,100');
    await userEvent.tab();
    await waitFor(() =>
      expect(api.setActualCash).toHaveBeenCalledWith({ branchId: 3, date: '2026-10-01', actualCash: 11100 }),
    );
  });
});
