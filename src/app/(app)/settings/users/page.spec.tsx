import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLE_DEFAULTS } from '@/lib/rbac/features';
import { renderWithQuery } from '@/test/renderWithQuery';
import { buildRoleMatrix, buildUserMatrix, NAV_FEATURE_COUNT } from '@/test/permissionFixtures';

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({ toast }));
vi.mock('@/components/layout/usePageHeader', () => ({ usePageHeader: () => {} }));

const usersApi = {
  list: vi.fn(),
  create: vi.fn(),
  updateRole: vi.fn(),
  updateBranch: vi.fn(),
  setActive: vi.fn(),
  resetPassword: vi.fn(),
};
const branchesApi = { list: vi.fn() };
const permissionsApi = {
  matrix: vi.fn(),
  userMatrix: vi.fn(),
  setUserPermission: vi.fn(),
  resetUserPermission: vi.fn(),
};
vi.mock('@/lib/apiServices', () => ({ usersApi, branchesApi, permissionsApi }));

const { default: UsersPage } = await import('./page');

const USERS = [
  { id: 2, email: 'viewer@louella.com', role: 'VIEWER', isActive: true, branchId: null },
  { id: 3, email: 'admin@louella.com', role: 'ADMIN', isActive: true, branchId: null },
];

/** Open the create dialog and return the userEvent instance plus the dialog. */
async function openCreateDialog() {
  const user = userEvent.setup();
  renderWithQuery(<UsersPage />);
  await waitFor(() => expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: /create user/i }));
  const dialog = await screen.findByRole('dialog');
  return { user, dialog };
}

function checkboxIn(dialog: HTMLElement, label: string) {
  return within(dialog).getByRole('checkbox', { name: label });
}

/** The email field. Both it and the password field expose role "textbox". */
function emailField(dialog: HTMLElement) {
  return within(dialog).getAllByRole('textbox')[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  usersApi.list.mockResolvedValue({ data: { data: USERS, total: USERS.length } });
  usersApi.create.mockResolvedValue({ data: { id: 9, email: 'new@louella.com', role: 'VIEWER' } });
  branchesApi.list.mockResolvedValue({ data: [] });
  permissionsApi.matrix.mockResolvedValue({ data: buildRoleMatrix() });
  permissionsApi.setUserPermission.mockResolvedValue({ data: {} });
  permissionsApi.resetUserPermission.mockResolvedValue({ data: {} });
});

describe('Users screen', () => {
  it('lists the accounts returned by the API', async () => {
    renderWithQuery(<UsersPage />);
    await waitFor(() => expect(screen.getByText('viewer@louella.com')).toBeInTheDocument());
    expect(screen.getByText('admin@louella.com')).toBeInTheDocument();
  });
});

describe('Users screen — access-aware creation', () => {
  it('previews the screens the chosen role will grant', async () => {
    const { dialog } = await openCreateDialog();

    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());
    // VIEWER holds dashboard + analytics, both of which are nav destinations.
    expect(within(dialog).getByText(`2 of ${NAV_FEATURE_COUNT} screens`)).toBeInTheDocument();
    expect(checkboxIn(dialog, 'Dashboard')).toBeChecked();
    expect(checkboxIn(dialog, 'Revenue & Analytics')).toBeChecked();
    expect(checkboxIn(dialog, 'Products')).not.toBeChecked();
  });

  it('lists only nav destinations, never mobile-only features', async () => {
    // Ticking a mobile key would promise a screen the web app does not have.
    const { dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(NAV_FEATURE_COUNT);
    expect(within(dialog).queryByRole('checkbox', { name: 'Quick Entry' })).not.toBeInTheDocument();
  });

  it('counts a ticked box as an override', async () => {
    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.click(checkboxIn(dialog, 'Products'));

    await waitFor(() =>
      expect(within(dialog).getByText(`3 of ${NAV_FEATURE_COUNT} screens · 1 override`)).toBeInTheDocument(),
    );
  });

  it('clears the override when a box is returned to the role default', async () => {
    // Otherwise an admin who changes their mind writes a redundant override row
    // that silently detaches the account from future role changes.
    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.click(checkboxIn(dialog, 'Products'));
    await waitFor(() => expect(within(dialog).getByText(/1 override/)).toBeInTheDocument());

    await user.click(checkboxIn(dialog, 'Products'));
    await waitFor(() =>
      expect(within(dialog).getByText(`2 of ${NAV_FEATURE_COUNT} screens`)).toBeInTheDocument(),
    );
    // The summary drops its override tally entirely rather than showing zero.
    expect(within(dialog).queryByText(/· \d+ override/)).not.toBeInTheDocument();
  });

  it('reflects role-level overrides in the preview, not just the code defaults', async () => {
    // The preview reads the live matrix so an admin sees what the role really
    // grants today, including overrides they made earlier.
    permissionsApi.matrix.mockResolvedValue({
      data: buildRoleMatrix({ 'VIEWER:products': true }),
    });

    const { dialog } = await openCreateDialog();
    await waitFor(() => expect(checkboxIn(dialog, 'Products')).toBeChecked());
    expect(within(dialog).getByText(`3 of ${NAV_FEATURE_COUNT} screens`)).toBeInTheDocument();
  });

  it('creates the account and then applies the chosen overrides', async () => {
    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.type(emailField(dialog), 'new@louella.com');
    await user.type(
      within(dialog).getByPlaceholderText('Min. 8 characters'),
      'Str0ngPass!',
    );
    await user.click(checkboxIn(dialog, 'Products'));
    await user.click(checkboxIn(dialog, 'Dashboard'));

    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(usersApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@louella.com', role: 'VIEWER' }),
      ),
    );

    // Overrides can only be written once the account has an id, so they follow
    // the create rather than riding in its payload.
    await waitFor(() => expect(permissionsApi.setUserPermission).toHaveBeenCalledTimes(2));
    expect(permissionsApi.setUserPermission).toHaveBeenCalledWith(9, 'products', true);
    expect(permissionsApi.setUserPermission).toHaveBeenCalledWith(9, 'dashboard', false);
  });

  it('skips the override call entirely when nothing was changed', async () => {
    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.type(emailField(dialog), 'plain@louella.com');
    await user.type(within(dialog).getByPlaceholderText('Min. 8 characters'), 'Str0ngPass!');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(usersApi.create).toHaveBeenCalled());
    expect(permissionsApi.setUserPermission).not.toHaveBeenCalled();
  });

  it('hands over the temporary password once the account exists', async () => {
    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.type(emailField(dialog), 'new@louella.com');
    await user.type(within(dialog).getByPlaceholderText('Min. 8 characters'), 'Str0ngPass!');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(screen.getByText(/share this temporary password/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('Str0ngPass!')).toBeInTheDocument();
  });

  it('keeps the account when only the override write fails', async () => {
    // The user already exists at that point; losing the dialog silently would
    // hide the fact that their access is not what the admin asked for.
    permissionsApi.setUserPermission.mockRejectedValue(new Error('nope'));

    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.type(emailField(dialog), 'new@louella.com');
    await user.type(within(dialog).getByPlaceholderText('Min. 8 characters'), 'Str0ngPass!');
    await user.click(checkboxIn(dialog, 'Products'));
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/account created, but some permission overrides failed/i),
      ),
    );
  });

  it('reports a rejected create without pretending it succeeded', async () => {
    usersApi.create.mockRejectedValue({
      response: { data: { message: 'Email already in use' } },
    });

    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.type(emailField(dialog), 'dupe@louella.com');
    await user.type(within(dialog).getByPlaceholderText('Min. 8 characters'), 'Str0ngPass!');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(screen.getByText('Email already in use')).toBeInTheDocument());
    expect(screen.queryByText(/share this temporary password/i)).not.toBeInTheDocument();
  });

  it('requires an email and a password before calling the API', async () => {
    const { user, dialog } = await openCreateDialog();
    await waitFor(() => expect(within(dialog).getByText('This account will see')).toBeInTheDocument());

    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Email is required.')).toBeInTheDocument());
    expect(usersApi.create).not.toHaveBeenCalled();

    await user.type(emailField(dialog), 'new@louella.com');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(screen.getByText('Password is required.')).toBeInTheDocument());
    expect(usersApi.create).not.toHaveBeenCalled();
  });
});

describe('Users screen — per-user permission drawer', () => {
  async function openDrawerForFirstUser() {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix({ id: 2, email: 'viewer@louella.com', role: 'VIEWER' }),
    });

    const user = userEvent.setup();
    renderWithQuery(<UsersPage />);
    await waitFor(() => expect(screen.getByText('viewer@louella.com')).toBeInTheDocument());

    const row = screen.getByText('viewer@louella.com').closest('tr')!;
    const buttons = within(row).getAllByRole('button');
    // The permissions drawer is the last action on the row.
    await user.click(buttons[buttons.length - 1]);
    return user;
  }

  it('loads that account and explains what overrides do', async () => {
    await openDrawerForFirstUser();

    await waitFor(() => expect(permissionsApi.userMatrix).toHaveBeenCalledWith(2));
    expect(
      await screen.findByText(/overrides apply on top of the/i),
    ).toBeInTheDocument();
  });

  it('shows the account its role currently grants', async () => {
    await openDrawerForFirstUser();

    await waitFor(() => expect(screen.getByRole('switch', { name: 'Dashboard' })).toBeChecked());
    expect(screen.getByRole('switch', { name: 'Products' })).not.toBeChecked();
    expect(ROLE_DEFAULTS.VIEWER).toContain('dashboard');
  });

  it('writes an override when a switch is flipped', async () => {
    const user = await openDrawerForFirstUser();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Products' })).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: 'Products' }));

    await waitFor(() =>
      expect(permissionsApi.setUserPermission).toHaveBeenCalledWith(2, 'products', true),
    );
  });

  it('offers reset only once a row is actually overridden', async () => {
    permissionsApi.userMatrix.mockResolvedValue({
      data: buildUserMatrix({ id: 2, email: 'viewer@louella.com', role: 'VIEWER' }, { products: true }),
    });

    const user = userEvent.setup();
    renderWithQuery(<UsersPage />);
    await waitFor(() => expect(screen.getByText('viewer@louella.com')).toBeInTheDocument());
    const row = screen.getByText('viewer@louella.com').closest('tr')!;
    const buttons = within(row).getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);

    const resets = await screen.findAllByRole('button', { name: 'Reset' });
    expect(resets).toHaveLength(1);

    await user.click(resets[0]);
    await waitFor(() =>
      expect(permissionsApi.resetUserPermission).toHaveBeenCalledWith(2, 'products'),
    );
  });

  it('relays the server reason when an override is refused', async () => {
    permissionsApi.setUserPermission.mockRejectedValue({
      response: { data: { message: '"permissions" cannot be disabled for ADMIN' } },
    });

    const user = await openDrawerForFirstUser();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Products' })).toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: 'Products' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('"permissions" cannot be disabled for ADMIN'),
    );
  });
});
