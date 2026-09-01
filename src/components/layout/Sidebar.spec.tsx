import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_DEFAULTS } from '@/lib/rbac/features';

const pathname = { current: '/dashboard' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// next/image needs a real loader; a plain span is enough for these assertions.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <span>{String(props.alt ?? '')}</span>,
}));

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

const { default: Sidebar } = await import('./Sidebar');

function renderWith(permissions: string[], path = '/dashboard') {
  auth.permissions = permissions;
  pathname.current = path;
  return render(<Sidebar collapsed={false} onToggle={() => {}} />);
}

/** Nav item labels currently rendered, ignoring the collapse button. */
function visibleItems(): string[] {
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter((label) => label.length > 0);
}

describe('Sidebar', () => {
  beforeEach(() => {
    auth.permissions = [];
    pathname.current = '/dashboard';
  });

  it('renders nothing navigable for an account with no permissions', () => {
    renderWith([]);
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(screen.queryByText('Products')).toBeNull();
  });

  it('renders exactly the destinations the permissions unlock', () => {
    renderWith(['dashboard', 'products']);
    expect(visibleItems().sort()).toEqual(['Dashboard', 'Products']);
  });

  it('omits a destination whose key is absent', () => {
    renderWith(['dashboard']);
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('renders no nav entry for mobile-only features', () => {
    // quick-entry and friends unlock mobile screens and must not add sidebar
    // rows that lead nowhere on the web.
    renderWith(['quick-entry', 'branch-comparison', 'waste-report', 'approval-queue']);
    expect(visibleItems()).toEqual([]);
  });

  it('groups destinations under their manifest heading', () => {
    renderWith(['dashboard', 'products', 'jobs']);
    expect(screen.getByText('Catalog')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('shows the Jobs entry to whoever holds the key', () => {
    // Regression: RouteGuard gated all of /settings at ADMIN while the sidebar
    // showed Jobs, so clicking it bounced the user to /dashboard. Asserted
    // against the key itself so narrowing a role's defaults cannot retire the
    // regression check by accident.
    renderWith(['dashboard', 'jobs']);
    expect(screen.getByText('Jobs')).toBeTruthy();
    expect(screen.queryByText('Permissions')).toBeNull();
  });

  it('hides Jobs from a default manager', () => {
    renderWith([...ROLE_DEFAULTS.MANAGER]);
    expect(screen.queryByText('Jobs')).toBeNull();
  });

  it('shows an admin the permission and user screens', () => {
    renderWith([...ROLE_DEFAULTS.ADMIN]);
    expect(screen.getByText('Users')).toBeTruthy();
    expect(screen.getByText('Permissions')).toBeTruthy();
  });

  describe('per-role snapshots of what is visible', () => {
    it('VIEWER sees only the read-only overview screens', () => {
      renderWith([...ROLE_DEFAULTS.VIEWER]);
      expect(visibleItems().sort()).toEqual(['Dashboard', 'Revenue']);
    });

    it('INVENTORY sees its operational screens, including a landing page', () => {
      renderWith([...ROLE_DEFAULTS.INVENTORY]);
      expect(visibleItems().sort()).toEqual(['Adjustments', 'Dashboard', 'Inventory']);
    });
  });

  describe('active highlighting', () => {
    it('marks exactly one item active on a nested route', () => {
      // /production/orders matches both the `production` and `production-orders`
      // prefixes; longest-prefix resolution must pick the latter alone.
      renderWith([...ROLE_DEFAULTS.MANAGER], '/production/orders');
      const active = screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('bg-primary'));
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toContain('Prod. Orders');
    });

    it('keeps the section active while on one of its sub-routes', () => {
      renderWith([...ROLE_DEFAULTS.MANAGER], '/inventory/gaps');
      const active = screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('bg-primary'));
      expect(active).toHaveLength(1);
      expect(active[0].textContent).toContain('Inventory');
    });
  });
});
