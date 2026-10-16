import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
const nav = { pathname: '/inventory/details', view: null as string | null };
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.view ? `view=${nav.view}` : ''),
}));
const api = { pendingTransfers: vi.fn() };
vi.mock('@/lib/apiServices', () => ({ inventoryAdjustmentsApi: api }));

const { PhoneTabBar } = await import('./PhoneTabBar');

const ALL = ['inventory-history', 'production-orders', 'branch-cash', 'inventory-adjustments'];
const transfer = (direction: 'incoming' | 'outgoing', canRespond = true) => ({ id: Math.random(), direction, canRespond });

describe('PhoneTabBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = [...ALL];
    nav.pathname = '/inventory/details';
    nav.view = null;
    api.pendingTransfers.mockResolvedValue({ data: [] });
  });

  it('links Count, Orders and Cash, and opens More', async () => {
    const onOpenMore = vi.fn();
    const { container } = renderWithQuery(<PhoneTabBar onOpenMore={onOpenMore} />);
    expect(screen.getByRole('link', { name: /Count/ })).toHaveAttribute('href', '/inventory/details');
    expect(screen.getByRole('link', { name: /Orders/ })).toHaveAttribute('href', '/production/orders');
    expect(screen.getByRole('link', { name: /Cash/ })).toHaveAttribute('href', '/inventory/details?view=cash');
    await userEvent.click(screen.getByRole('button', { name: /More/ }));
    expect(onOpenMore).toHaveBeenCalled();
    expect(container.firstElementChild).toHaveClass('md:hidden');
  });

  it('marks the current tab', () => {
    nav.view = 'cash';
    renderWithQuery(<PhoneTabBar onOpenMore={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Cash/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Count/ })).not.toHaveAttribute('aria-current');
  });

  it('shows only the tabs the account can open', () => {
    auth.permissions = ['inventory-history', 'production-orders'];
    renderWithQuery(<PhoneTabBar onOpenMore={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /Cash/ })).toBeNull();
    expect(api.pendingTransfers).not.toHaveBeenCalled();
  });

  it('badges Count with the transfers waiting for this branch', async () => {
    api.pendingTransfers.mockResolvedValue({
      data: [transfer('incoming'), transfer('incoming'), transfer('outgoing'), transfer('incoming', false)],
    });
    renderWithQuery(<PhoneTabBar onOpenMore={vi.fn()} />);
    expect(await screen.findByLabelText('2 transfers waiting')).toHaveTextContent('2');
  });
});
