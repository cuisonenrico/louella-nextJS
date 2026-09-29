import { test, expect } from '../fixtures/test';
import { buildWorld } from '../fixtures/world';
import { LoginPage } from '../pages/login.page';
import { ADMIN } from '../support/credentials';

test.use({ asAdmin: false });

test.describe('auth @smoke', () => {
  test('admin logs in and lands off /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, ADMIN.password);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('wrong password shows an error and stays on /login', async ({ page, api }) => {
    // A throwaway account: five failures lock an account for 15 minutes, and the
    // shared admin must never be the one that gets locked.
    const world = await buildWorld(api, { products: 0 });
    const login = new LoginPage(page);
    await login.goto();
    await login.login(world.manager.email, 'Wrong-Password-1');
    await expect(login.error).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('reload keeps the session via the refresh cookie', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, ADMIN.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/dashboard');
    // Let goto's own refresh finish, so the waiter below can only match the RELOAD's.
    await page.waitForLoadState('networkidle');
    const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh'));
    await page.reload();
    expect((await refreshed).ok()).toBe(true);
    // Signed in after the reload: the account menu renders, and we were not bounced to /login.
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
