import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';
import { buildRoleMatrix, buildUserMatrix, FEATURE_COUNT } from '@/test/permissionFixtures';

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));
vi.mock('@/components/layout/usePageHeader', () => ({ usePageHeader: () => {} }));

const permissionsApi = {
  matrix: vi.fn(),
  userMatrix: vi.fn(),
  setRolePermission: vi.fn(),
  setUserPermission: vi.fn(),
  resetUserPermission: vi.fn(),
};
const usersApi = { list: vi.fn() };
vi.mock('@/lib/apiServices', () => ({ permissionsApi, usersApi }));

const { default: PermissionsPage } = await import('./page');

const USERS = [
  { id: 2, email: 'manager@louella.com', role: 'MANAGER', isActive: true },
  { id: 4, email: 'admin@louella.com', role: 'ADMIN', isActive: true },
];

function switchFor(label: string, role: string) {
  return screen.getByRole('switch', { name: `${label} for ${role}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionsApi.matrix.mockResolvedValue({ data: buildRoleMatrix() });
  permissionsApi.setRolePermission.mockResolvedValue({ data: {} });
  permissionsApi.setUserPermission.mockResolvedValue({ data: {} });
  permissionsApi.resetUserPermission.mockResolvedValue({ data: {} });
  usersApi.list.mockResolvedValue({ data: { data: USERS } });
});

describe('Permissions screen — role matrix', () => {
  it('renders one row per feature in the manifest', async () => {
    renderWithQuery(<PermissionsPage />);
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());

    // Feature rows carry a switch per role; group headings are single-cell rows.
    expect(screen.getAllByRole('switch')).toHaveLength(FEATURE_COUNT * 4);
  });

  it('groups features under their manifest heading', async () => {
    renderWithQuery(<PermissionsPage />);
    await waitFor(() => expect(screen.getByText('Overview')).toBeInTheDocument());

    for (const group of ['Overview', 'Operations', 'Stock', 'Catalog', 'Config', 'Settings']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });

  it('separates mobile-only features into their own section', async () => {
    // They unlock no web screen, so an admin needs to see that at a glance.
    renderWithQuery(<PermissionsPage />);
    await waitFor(() => expect(screen.getByText('Mobile app')).toBeInTheDocument());
  });

  it('reflects the role defaults as switch state', async () => {
    renderWithQuery(<PermissionsPage />);
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());

    expect(switchFor('Dashboard', 'Viewer')).toBeChecked();
    expect(switchFor('Products', 'Viewer')).not.toBeChecked();
    // Production is branch-operations work a manager does daily; the product
    // catalog is not. Narrowing MANAGER to that core is the point of the
    // default, so this asserts both halves of it.
    expect(switchFor('Production', 'Manager')).toBeChecked();
    expect(switchFor('Products', 'Manager')).not.toBeChecked();
  });

  it('marks an overridden cell', async () => {
    permissionsApi.matrix.mockResolvedValue({
      data: buildRoleMatrix({ 'VIEWER:products': true }),
    });
    renderWithQuery(<PermissionsPage />);

    await waitFor(() => expect(switchFor('Products', 'Viewer')).toBeChecked());
    expect(screen.getAllByText('Overridden')).toHaveLength(1);
  });

  it('sends the toggle to the API with the role and key', async () => {
    const user = userEvent.setup();
    renderWithQuery(<PermissionsPage />);
    await waitFor(() => expect(screen.getByText('Products')).toBeInTheDocument());

    await user.click(switchFor('Products', 'Viewer'));

    await waitFor(() =>
      expect(permissionsApi.setRolePermission).toHaveBeenCalledWith('VIEWER', 'products', true),
    );
  });

  describe('admin lockout', () => {
    // The server refuses to revoke these from ADMIN. The UI has to say so up
    // front rather than letting an admin discover the rule through a 400.
    it('disables the switches an admin may never lose', async () => {
      renderWithQuery(<PermissionsPage />);
      await waitFor(() => expect(screen.getByText('Permissions')).toBeInTheDocument());

      expect(switchFor('Permissions', 'Admin')).toBeDisabled();
      expect(switchFor('User Management', 'Admin')).toBeDisabled();
    });

    it('leaves the same features editable for every other role', async () => {
      renderWithQuery(<PermissionsPage />);
      await waitFor(() => expect(screen.getByText('Permissions')).toBeInTheDocument());

      expect(switchFor('Permissions', 'Manager')).toBeEnabled();
      expect(switchFor('User Management', 'Viewer')).toBeEnabled();
    });

    it('surfaces the server explanation when a write is refused', async () => {
      // Belt and braces: the endpoint is reachable directly, so the rule lives
      // on the server and the UI must relay its reason verbatim.
      permissionsApi.setRolePermission.mockRejectedValue({
        response: { data: { message: '"permissions" cannot be disabled for ADMIN' } },
      });

      const user = userEvent.setup();
      renderWithQuery(<PermissionsPage />);
      await waitFor(() => expect(screen.getByText('Products')).toBeInTheDocument());

      await user.click(switchFor('Products', 'Manager'));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('"permissions" cannot be disabled for ADMIN'),
      );
    });
  });

  it('shows a retry affordance when the matrix cannot be loaded', async () => {
    permissionsApi.matrix.mockRejectedValue(new Error('boom'));
    renderWithQuery(<PermissionsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument());
  });
});

describe('Permissions screen — user overrides', () => {
  async function openUserTab() {
    const user = userEvent.setup();
    renderWithQuery(<PermissionsPage />);
    await user.click(screen.getByRole('tab', { name: 'User Overrides' }));
    await waitFor(() => expect(screen.getByText('Select User')).toBeInTheDocument());
    return user;
  }

  it('prompts for a user before showing anything', async () => {
    await openUserTab();
    expect(
      screen.getByText(/select a user to view and edit their permission overrides/i),
    ).toBeInTheDocument();
    expect(permissionsApi.userMatrix).not.toHaveBeenCalled();
  });

  it('loads the selected account and shows its role', async () => {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix({ id: 2, email: 'manager@louella.com', role: 'MANAGER' }),
    });

    const user = await openUserTab();
    await waitFor(() => expect(screen.getByText('manager@louella.com')).toBeInTheDocument());
    await user.click(screen.getByText('manager@louella.com'));

    await waitFor(() => expect(permissionsApi.userMatrix).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.getByText(/Role: MANAGER/)).toBeInTheDocument());
  });

  it('distinguishes an inherited grant from an overridden one', async () => {
    // The old endpoint could not express this: it stamped one user's override
    // across every role column, so "inherited" and "overridden" looked alike.
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix(
        { id: 2, email: 'manager@louella.com', role: 'MANAGER' },
        { production: false },
      ),
    });

    const user = await openUserTab();
    await user.click(await screen.findByText('manager@louella.com'));

    await waitFor(() => expect(screen.getByText('Override')).toBeInTheDocument());
    expect(screen.getByText(/Role default: enabled/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Production' })).not.toBeChecked();
    // Inventory is inherited, so it carries no override marker.
    expect(screen.getByRole('switch', { name: 'Inventory' })).toBeChecked();
  });

  it('offers reset only for the overridden rows', async () => {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix(
        { id: 2, email: 'manager@louella.com', role: 'MANAGER' },
        { products: false },
      ),
    });

    const user = await openUserTab();
    await user.click(await screen.findByText('manager@louella.com'));

    await waitFor(() => expect(screen.getByText('Override')).toBeInTheDocument());
    const resets = screen.getAllByRole('button', { name: /reset .* to role default/i });
    expect(resets).toHaveLength(1);

    await user.click(resets[0]);
    await waitFor(() =>
      expect(permissionsApi.resetUserPermission).toHaveBeenCalledWith(2, 'products'),
    );
  });

  it('writes a per-user override when a row is toggled', async () => {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix({ id: 2, email: 'manager@louella.com', role: 'MANAGER' }),
    });

    const user = await openUserTab();
    await user.click(await screen.findByText('manager@louella.com'));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Production' })).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: 'Production' }));

    await waitFor(() =>
      expect(permissionsApi.setUserPermission).toHaveBeenCalledWith(2, 'production', false),
    );
  });

  it('locks the protected rows for an admin account', async () => {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix({ id: 4, email: 'admin@louella.com', role: 'ADMIN' }),
    });

    const user = await openUserTab();
    await user.click(await screen.findByText('admin@louella.com'));

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Permissions' })).toBeDisabled());
    expect(screen.getByRole('switch', { name: 'User Management' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Products' })).toBeEnabled();
  });

  it('relays the server message when an override write is refused', async () => {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix({ id: 2, email: 'manager@louella.com', role: 'MANAGER' }),
    });
    permissionsApi.setUserPermission.mockRejectedValue({
      response: { data: { message: 'Unknown feature "prodcuts"' } },
    });

    const user = await openUserTab();
    await user.click(await screen.findByText('manager@louella.com'));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Products' })).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: 'Products' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unknown feature "prodcuts"'));
  });

  it('keeps each account on its own query so switching users refetches', async () => {
    permissionsApi.userMatrix.mockImplementation((id: number) =>
      Promise.resolve({
        data: buildUserMatrix({
          id,
          email: id === 2 ? 'manager@louella.com' : 'admin@louella.com',
          role: id === 2 ? 'MANAGER' : 'ADMIN',
        }),
      }),
    );

    const user = await openUserTab();
    const list = screen.getByText('Select User').closest('div')!.parentElement!;

    await user.click(await within(list).findByText('manager@louella.com'));
    await waitFor(() => expect(permissionsApi.userMatrix).toHaveBeenCalledWith(2));

    await user.click(within(list).getByText('admin@louella.com'));
    await waitFor(() => expect(permissionsApi.userMatrix).toHaveBeenCalledWith(4));
  });
});
