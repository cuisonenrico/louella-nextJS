import { test, expect } from '@playwright/test';

// A fresh context every time: no storageState, so nobody is signed in.
test.use({ storageState: { cookies: [], origins: [] } });

test('BUG-002: a wrong password shows an error and does not reload', async ({ page }) => {
  test.setTimeout(180_000);
  const auth: string[] = [];
  let navigations = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/auth/')) auth.push(`${r.method()} ${r.url().split('/api/v1')[1]}`);
  });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });

  await page.goto('/login');
  navigations = 0; auth.length = 0;

  await page.locator('input[type="email"]').first().fill('admin@louella.com');
  await page.locator('input[type="password"]').first().fill('DefinitelyWrong!123');
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();

  const alert = page.getByText(/invalid email or password/i);
  await expect(alert).toBeVisible({ timeout: 15_000 });

  await page.waitForTimeout(2500);
  console.log(`  error visible:      ${await alert.isVisible()}`);
  console.log(`  navigation events:  ${navigations} (same-document ones count here too)`);
  console.log(`  auth calls:         ${auth.join(' , ')}`);

  // The error must still be on screen after things settle — that is what the
  // interceptor's hard redirect used to wipe. Whether the document itself
  // survived is asserted separately in 09-reload-probe.
  await expect(alert).toBeVisible();

  // And the failed login must no longer spend a refresh it cannot use.
  expect(auth.filter((c) => c.includes('refresh'))).toEqual([]);
});

test('BUG-010: an anonymous visitor fires no refresh', async ({ page }) => {
  test.setTimeout(120_000);
  const auth: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/v1/auth/')) auth.push(`${r.method()} ${r.url().split('/api/v1')[1]}`);
  });

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  console.log(`  auth calls on an anonymous /login visit: ${auth.length ? auth.join(' , ') : '(none)'}`);
  expect(auth.filter((c) => c.includes('refresh'))).toEqual([]);
});
