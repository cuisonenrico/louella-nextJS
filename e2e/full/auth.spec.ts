import { test, expect } from '../fixtures/test';
import { today } from '../fixtures/dates';
import { buildWorld, managerPage } from '../fixtures/world';
import { LoginPage } from '../pages/login.page';
import { VIEWER } from '../support/credentials';

test.describe('auth', () => {
  test('logout returns to /login and protects /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: /logout/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a manager can read their own branch but not another one', async ({ api, browser }) => {
    const mine = await buildWorld(api, { products: 1 });
    const other = await buildWorld(api, { products: 1 });
    const page = await managerPage(browser, mine);
    await page.goto('/inventory/details');
    // The branch list is an open catalog read, so the picker shows every branch; the
    // scoping is on the data (BranchGuard). The manager's own branch must be selectable.
    await expect(page.getByRole('radio', { name: mine.branch.name })).toBeVisible();

    const login = await page.request.post('/api/v1/auth/login', {
      data: { email: mine.manager.email, password: mine.manager.password },
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const headers = { Authorization: `Bearer ${accessToken}` };
    // Not /sales: MANAGER lacks the `analytics` feature, so that is a 403 for every branch.
    // Not /inventory/branch/:id/date either: for a scoped manager it is 400 today (see the
    // fixme'd test in full/inventory-sheet.spec.ts). The summary route is branch-guarded and works.
    const summary = (branchId: number) =>
      page.request.get('/api/v1/inventory/summary', {
        params: { startDate: today(), endDate: today(), branchId },
        headers,
      });

    // Positive control first: the route works for the manager's own branch…
    const own = await summary(mine.branch.id);
    expect(own.status(), await own.text()).toBe(200);
    // …and the same route refuses another branch.
    expect((await summary(other.branch.id)).status()).toBe(403);
    await page.context().close();
  });

  test('a viewer visiting an admin page is sent to their first permitted route', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(VIEWER.email, VIEWER.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/settings/users');
    // RouteGuard replaces a denied route with firstPermittedRoute(); /no-access is only
    // for accounts that hold no route at all.
    await expect(page).toHaveURL(/\/dashboard/);
    await context.close();
  });

  test('change password: new works, old is refused', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 0 });
    const page = await managerPage(browser, world);
    const next = 'E2e-Changed-Pass-2';
    await page.goto('/change-password');
    await page.getByLabel('Current Password').fill(world.manager.password);
    await page.getByLabel('New Password', { exact: true }).fill(next);
    await page.getByLabel('Confirm New Password').fill(next);
    await page.getByRole('button', { name: 'Change Password' }).click();
    // The page confirms, then signs the user out (~1.5 s).
    await expect(page).toHaveURL(/\/login/);

    const old = await page.request.post('/api/v1/auth/login', {
      data: { email: world.manager.email, password: world.manager.password },
    });
    expect(old.status()).toBe(401);
    const fresh = await page.request.post('/api/v1/auth/login', {
      data: { email: world.manager.email, password: next },
    });
    expect(fresh.ok()).toBe(true);
    await page.context().close();
  });
});
