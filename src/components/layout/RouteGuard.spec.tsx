import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_DEFAULTS } from '@/lib/rbac/features';

const pathname = { current: '/dashboard' };
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const auth = {
  isLoading: false,
  isAuthenticated: true,
  permissions: [] as string[],
};
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const { default: RouteGuard } = await import('./RouteGuard');

function renderAt(path: string, permissions: string[]) {
  pathname.current = path;
  auth.permissions = permissions;
  return render(
    <RouteGuard>
      <p>page content</p>
    </RouteGuard>,
  );
}

describe('RouteGuard', () => {
  beforeEach(() => {
    replace.mockClear();
    auth.isLoading = false;
    auth.isAuthenticated = true;
  });

  it('renders the page when the permission is held', () => {
    renderAt('/products', ['products']);
    expect(screen.getByText('page content')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders nothing and redirects when it is not', () => {
    renderAt('/products', ['dashboard']);
    expect(screen.queryByText('page content')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/dashboard');
  });

  it('allows a sub-route of a permitted section', () => {
    renderAt('/inventory/gaps', ['inventory-history']);
    expect(screen.getByText('page content')).toBeTruthy();
  });

  it('does not let a permitted prefix leak into a similarly named route', () => {
    // Holding `inventory-history` must not open /inventory-adjustments.
    renderAt('/inventory-adjustments', ['inventory-history']);
    expect(screen.queryByText('page content')).toBeNull();
  });

  it('lets a jobs holder reach /settings/jobs', () => {
    // The exact regression: /settings was gated at ADMIN by first-prefix match,
    // so someone holding `jobs` was bounced off the screen it unlocks. Stated
    // against an explicit key rather than a role's defaults, so narrowing a
    // role cannot quietly stop exercising the longest-prefix rule.
    renderAt('/settings/jobs', ['dashboard', 'jobs']);
    expect(screen.getByText('page content')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps a default manager out of /settings/jobs', () => {
    // `jobs` is no longer a MANAGER default — running scheduled jobs is now a
    // deliberate grant rather than something every branch manager inherits.
    expect(ROLE_DEFAULTS.MANAGER).not.toContain('jobs');
    renderAt('/settings/jobs', [...ROLE_DEFAULTS.MANAGER]);
    expect(screen.queryByText('page content')).toBeNull();
  });

  it('still keeps a manager out of /settings/permissions', () => {
    renderAt('/settings/permissions', [...ROLE_DEFAULTS.MANAGER]);
    expect(screen.queryByText('page content')).toBeNull();
  });

  it('leaves ungated routes reachable', () => {
    renderAt('/no-access', []);
    expect(screen.getByText('page content')).toBeTruthy();
  });

  describe('redirect target', () => {
    it('never redirects a user into a route they are also denied', () => {
      // The old guard always sent denials to /dashboard. A role without the
      // `dashboard` permission was therefore redirected to a route it was
      // denied, and redirected again from there — rendering null forever.
      const noDashboard = ['inventory-history'];
      renderAt('/products', noDashboard);

      expect(replace).toHaveBeenCalledTimes(1);
      const target = replace.mock.calls[0][0] as string;
      expect(target).not.toBe('/dashboard');
      expect(target).toBe('/inventory/details');
    });

    it('sends a user with no permitted screens to /no-access', () => {
      renderAt('/products', []);
      expect(replace).toHaveBeenCalledWith('/no-access');
    });

    it('redirects every role to somewhere it can actually load', () => {
      for (const role of ['VIEWER', 'INVENTORY', 'MANAGER', 'ADMIN'] as const) {
        replace.mockClear();
        // /production-cost is off for every role by default, so this denies all.
        const { unmount } = renderAt('/production-cost', [...ROLE_DEFAULTS[role]]);
        const target = replace.mock.calls[0][0] as string;
        expect(target).not.toBe('/no-access');
        unmount();
      }
    });
  });

  describe('auth states', () => {
    it('renders nothing while auth is still resolving', () => {
      auth.isLoading = true;
      renderAt('/products', ['products']);
      expect(screen.queryByText('page content')).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    });

    it('defers to AuthGuard when unauthenticated rather than redirecting', () => {
      auth.isAuthenticated = false;
      renderAt('/products', []);
      expect(replace).not.toHaveBeenCalled();
    });
  });
});
