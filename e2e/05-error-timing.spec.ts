import { test, Page } from '@playwright/test';
import { ADMIN } from './routes';

test('how long until the error state actually appears', async ({ browser }) => {
  test.setTimeout(600_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });

  for (const { route, api } of [
    { route: '/products', api: '**/api/v1/products**' },
    { route: '/materials', api: '**/api/v1/materials**' },
  ]) {
    await page.unrouteAll();
    await page.route(api, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Injected failure' }) }));
    const done = page.waitForResponse((r) => r.url().includes('/auth/refresh'), { timeout: 30_000 }).catch(() => null);
    const t0 = Date.now();
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await done;

    let appearedMs = -1;
    for (let i = 0; i < 40; i++) {           // poll up to 20s
      const txt = (await page.locator('body').innerText().catch(() => '')).trim();
      if (/error|failed|try again|retry|wrong|could ?n.t/i.test(txt)) { appearedMs = Date.now() - t0; break; }
      await page.waitForTimeout(500);
    }
    const txt = (await page.locator('body').innerText().catch(() => '')).trim();
    const skel = await page.locator('.animate-pulse:visible').count();
    const retryBtn = await page.getByRole('button', { name: /retry|try again/i }).count();
    console.log(`${route}: errorUI after ${appearedMs === -1 ? 'NEVER (>20s)' : appearedMs + 'ms'} | skeletons=${skel} | retryButton=${retryBtn}`);
    console.log(`   text: ${txt.replace(/\s+/g, ' ').slice(0, 160)}`);
    await page.screenshot({ path: `e2e-results/screens/errstate${route.replace(/\//g,'_')}.png`, fullPage: true });
    await page.waitForTimeout(4000);
  }
  await ctx.close();
});
