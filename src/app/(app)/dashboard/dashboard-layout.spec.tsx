import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

// recharts measures its container, which jsdom reports as 0x0 and then warns
// about. The charts are not what this suite is about.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null,
}));

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

vi.mock('@/components/layout/usePageHeader', () => ({ usePageHeader: () => {} }));

/**
 * One branch entered inventory, one did not, and there is production and low
 * stock — so every panel has something to render and an omitted card is a
 * permission decision rather than an empty-data one.
 */
const SUMMARY = {
  stats: { products: 4, branches: 2, materials: 7, recipes: 2 },
  products: [],
  production: { totalYield: 100, byType: [{ type: 'BREAD', totalYield: 100 }] },
  lowStock: [{ id: 1, name: 'Flour', currentStock: 1, minimumStock: 10, unit: 'KG' }],
  branches: [
    { id: 1, name: 'Main', isActive: true },
    { id: 2, name: 'Annex', isActive: true },
  ],
  branchGaps: [{ id: 2, name: 'Annex' }],
};

vi.mock('@/lib/apiServices', () => ({
  dashboardApi: { summary: vi.fn().mockResolvedValue({ data: SUMMARY }) },
  productionOrdersApi: { byDate: vi.fn().mockResolvedValue({ data: [] }) },
  inventoryApi: { dashboard: vi.fn().mockResolvedValue({ data: { dailyBreakdown: [] } }) },
  branchesApi: { getAll: vi.fn().mockResolvedValue({ data: SUMMARY.branches }) },
}));

const { default: DashboardPage } = await import('./page');

/** A MANAGER after the 2026-09-02 narrowing: four of the seven panels. */
const MANAGER_PANELS = [
  'dashboard',
  'dashboard:kpis',
  'dashboard:production-mix',
  'dashboard:low-stock',
  'dashboard:branch-orders',
];

async function renderDashboard(permissions: string[]) {
  auth.permissions = permissions;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DashboardPage />
    </QueryClientProvider>
  );
  await screen.findByText("Today's Production");
}

describe('dashboard panel rows', () => {
  it('lays cards out by how many the viewer holds, not a fixed three', async () => {
    // Narrowing MANAGER made the child count a function of the viewer's panel
    // permissions while `lg:grid-cols-3` kept the column count a constant, so
    // a manager holding two of three panels got a hole in the row.
    await renderDashboard(MANAGER_PANELS);
    const row = screen.getByTestId('dashboard-operations-row');
    expect(row.className).toContain('auto-fit');
    expect(row.className).not.toContain('grid-cols-3');
  });

  it('renders no empty column for a panel the viewer lacks', async () => {
    await renderDashboard(MANAGER_PANELS);
    expect(screen.getByText('Branch Orders')).toBeTruthy();
    expect(screen.queryByText('Inventory Coverage')).toBeNull();
  });

  it('still hides a row entirely when no panel in it is held', async () => {
    await renderDashboard(['dashboard', 'dashboard:kpis', 'dashboard:production-mix']);
    expect(screen.queryByTestId('dashboard-operations-row')).toBeNull();
  });

  it('shows an admin every card in the same rows', async () => {
    await renderDashboard([
      ...MANAGER_PANELS,
      'dashboard:branch-gaps',
      'dashboard:revenue-trend',
    ]);
    expect(screen.getByText('Branch Orders')).toBeTruthy();
    expect(screen.getByText('Inventory Coverage')).toBeTruthy();
  });
});
