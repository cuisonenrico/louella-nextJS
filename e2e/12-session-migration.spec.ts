import { test, expect } from '@playwright/test';
import { ADMIN } from './routes';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Anyone signed in before the has_session flag existed holds refresh_token
 * and nothing else. That session is still valid and must survive the deploy.
 */
test('a pre-existing session with no has_session flag still works', async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });

  // Simulate the pre-deploy state: keep the refresh cookie, drop the new flag.
  const before = await context.cookies();
  await context.clearCookies();
  await context.addCookies(before.filter((c) => c.name !== 'has_session'));
  const names = (await context.cookies()).map((c) => c.name);
  console.log(`  cookies now: ${names.join(', ')}  (has_session deliberately removed)`);
  expect(names).not.toContain('has_session');

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);

  const path = new URL(page.url()).pathname;
  console.log(`  landed on: ${path}`);
  console.log(`  has_session restored by the server: ${(await context.cookies()).some((c) => c.name === 'has_session')}`);
  expect(path, 'an existing session must not be logged out by the deploy').toBe('/dashboard');
});

test('an anonymous visitor on a public page still fires no refresh', async ({ page }) => {
  test.setTimeout(120_000);
  const auth: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/v1/auth/')) auth.push(r.url().split('/api/v1')[1]); });
  for (const route of ['/', '/login', '/register']) {
    auth.length = 0;
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    console.log(`  ${route.padEnd(10)} auth calls: ${auth.join(', ') || '(none)'}`);
    expect(auth.filter((c) => c.includes('refresh'))).toEqual([]);
  }
});
