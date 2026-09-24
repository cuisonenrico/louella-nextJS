import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';
import { peso } from '@/lib/payroll/format';

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/layout/usePageHeader', () => ({ usePageHeader: () => undefined }));
vi.mock('@/components/branch-cash/BranchCashPanel', () => ({
  default: () => <div>panel</div>,
  BRANCH_CASH_KEY: ['branch-cash'],
}));

const branchCashApi = { summary: vi.fn(), categories: vi.fn().mockResolvedValue({ data: [] }) };
const branchesApi = { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Main' }, { id: 2, name: 'Cubao' }] }) };
vi.mock('@/lib/apiServices', () => ({ branchCashApi, branchesApi }));

const { default: CashReportsPage } = await import('./page');

const totals = (over = {}) => ({
  sales: 1000, expenses: 0, vale: 0, expected: 1000, actualCash: 990, overShort: -10, state: 'SHORT', drift: [], ...over,
});

describe('Cash Reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = ['branch-cash', 'all-branches', 'branch-cash:verify', 'branch-cash:categories'];
    branchCashApi.summary.mockResolvedValue({
      data: {
        rows: [
          { branchId: 2, branchName: 'Cubao', date: '2026-10-02', status: 'OPEN', totals: totals({ actualCash: null, overShort: null, state: 'NOT_COUNTED' }) },
          { branchId: 1, branchName: 'Main', date: '2026-10-01', status: 'VERIFIED', totals: totals() },
        ],
        totals: { sales: 2000, expenses: 0, vale: 0, expected: 2000, actualCash: 990, overShort: -10, days: 2, unverifiedDays: 1, notCountedDays: 1 },
      },
    });
  });

  it('lists branch-days with their status and the period totals', async () => {
    renderWithQuery(<CashReportsPage />);
    expect((await screen.findAllByText('Cubao')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not counted').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`Short ${peso(10)}`).length).toBeGreaterThan(0);
    expect(screen.getByText('1 of 2 days unverified')).toBeInTheDocument();
  });

  it('offers category management only with the key', async () => {
    renderWithQuery(<CashReportsPage />);
    expect(await screen.findByRole('button', { name: 'Categories' })).toBeInTheDocument();
  });

  it('hides the branch filter from a branch-scoped user', async () => {
    auth.permissions = ['branch-cash'];
    renderWithQuery(<CashReportsPage />);
    await screen.findAllByText('Cubao');
    expect(screen.queryByLabelText('Branch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Categories' })).toBeNull();
  });
});
