import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathname = { current: '/dashboard' };
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <span>{String(props.alt ?? '')}</span>,
}));

// A MANAGER-shaped session: several nav destinations, not all of them.
const auth = {
  permissions: ['dashboard', 'inventory-history', 'production', 'production-orders'] as string[],
  user: { email: 'manager@example.com' },
  logout: vi.fn(),
  isLoading: false,
  isAuthenticated: true,
};
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const { default: AppShell } = await import('./AppShell');

function open() {
  return userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
}

describe('app shell below the breakpoint', () => {
  beforeEach(() => {
    pathname.current = '/dashboard';
    push.mockClear();
  });

  it('keeps the static sidebar out of the layout below md', () => {
    render(<AppShell>page</AppShell>);
    // The aside is `hidden md:flex` — present in the DOM, removed from layout
    // by CSS. jsdom cannot compute that, so assert the class contract.
    const aside = screen.getByTestId('sidebar-aside');
    expect(aside.className).toContain('hidden');
    expect(aside.className).toContain('md:flex');
  });

  it('offers a menu trigger that is hidden from md up', () => {
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole('button', { name: /open navigation/i }).className).toContain(
      'md:hidden'
    );
  });

  it('mounts the drawer nav only once it is opened', async () => {
    // Queried against the DOM rather than by role: Radix marks the rest of the
    // document aria-hidden while a modal is open, so a role query would report
    // one nav either way and could not tell "not mounted" from "hidden".
    const navCount = () => document.querySelectorAll('nav[aria-label="Main"]').length;

    render(<AppShell>page</AppShell>);
    expect(navCount()).toBe(1);

    await open();
    expect(navCount()).toBe(2);
  });

  /**
   * The RBAC coupling. The drawer must render the same `navigationFor(permissions)`
   * output as the aside — one source, not two. A second nav could drift and
   * offer a manager a link RouteGuard then bounces them off.
   */
  it('shows the drawer exactly the items the sidebar shows', async () => {
    render(<AppShell>page</AppShell>);
    // 'Close' is the Sheet's own dismiss control, not a destination.
    const labels = (root: HTMLElement) =>
      within(root)
        .getAllByRole('button')
        .map((b) => b.textContent?.trim() ?? '')
        .filter((t) => t.length > 0 && t !== 'Close')
        .sort();

    const asideItems = labels(screen.getByTestId('sidebar-aside'));
    expect(asideItems.length).toBeGreaterThan(0);

    await open();
    expect(labels(screen.getByRole('dialog'))).toEqual(asideItems);
  });

  it('closes the drawer after a navigation', async () => {
    render(<AppShell>page</AppShell>);
    await open();
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Production'));

    expect(push).toHaveBeenCalledWith('/production');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets the content column shrink below its content width', () => {
    // Without min-w-0 a flex child refuses to shrink past its intrinsic
    // content width, so one wide table pushes the whole page into horizontal
    // scroll — the exact failure the viewport walk asserts against.
    render(<AppShell>page</AppShell>);
    expect(screen.getByTestId('content-column').className).toContain('min-w-0');
  });
});
