import { test } from '@playwright/test';
import { ADMIN } from './routes';

/**
 * How many ordinary page loads does an authenticated session survive?
 * Every full load calls POST /auth/refresh once (AuthContext bootstrap), and
 * that endpoint is throttled at 10/min.
 */
test('page loads until the session breaks', async ({ browser }) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext();          // no storageState: fresh login
  const page = await ctx.newPage();

  const seen: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/auth/refresh')) seen.push(String(r.status()));
  });

  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  console.log('logged in, landed on', new URL(page.url()).pathname);

  for (let i = 1; i <= 14; i++) {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const path = new URL(page.url()).pathname;
    const skeletons = await page.locator('.animate-pulse:visible').count();
    const spinners = await page.locator('.animate-spin:visible').count();
    const txt = (await page.locator('body').innerText().catch(() => '')).trim().length;
    console.log(
      `load ${String(i).padStart(2)}: refresh=${seen[seen.length - 1] ?? '-'} path=${path} ` +
      `skeletons=${skeletons} spinners=${spinners} bodyLen=${txt}` +
      (path === '/login' ? '   <-- LOGGED OUT' : (txt < 200 ? '   <-- STUCK SKELETON' : ''))
    );
    if (path === '/login') break;
  }
  console.log('refresh statuses:', seen.join(','));
  await ctx.close();
});
