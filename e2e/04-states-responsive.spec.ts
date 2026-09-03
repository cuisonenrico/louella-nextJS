import { test, Page } from '@playwright/test';
import { ADMIN } from './routes';

/** One login for the whole file: POST /auth/login is throttled at 5/min. */
async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

/** A full load costs one /auth/refresh; that endpoint allows 10/min. */
async function load(page: Page, route: string) {
  const done = page.waitForResponse((r) => r.url().includes('/auth/refresh'), { timeout: 30_000 }).catch(() => null);
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await done;
  await page.waitForTimeout(3500);
}

test('forced EMPTY and ERROR states', async ({ browser }) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);

  for (const { route, api } of [
    { route: '/products', api: '**/api/v1/products**' },
    { route: '/materials', api: '**/api/v1/materials**' },
    { route: '/branches', api: '**/api/v1/branches**' },
    { route: '/suppliers', api: '**/api/v1/suppliers**' },
  ]) {
    for (const mode of ['empty', 'error'] as const) {
      await page.unrouteAll();
      await page.route(api, (r) =>
        mode === 'empty'
          ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
          : r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Injected failure' }) })
      );
      await load(page, route);
      const txt = (await page.locator('body').innerText().catch(() => '')).trim();
      const skel = await page.locator('.animate-pulse:visible').count();
      const emptyMsg = /no .*(found|yet)|nothing|empty/i.test(txt);
      const errMsg = /error|failed|try again|retry|wrong|could ?n.t/i.test(txt);
      console.log(
        `${route.padEnd(12)} [${mode.padEnd(5)}] len=${String(txt.length).padStart(4)} skeletons=${String(skel).padStart(2)} ` +
        `emptyMsg=${emptyMsg} errorMsg=${errMsg}` +
        (mode === 'error' && !errMsg ? '  <-- NO ERROR UI' : '') +
        (mode === 'empty' && !emptyMsg ? '  <-- NO EMPTY UI' : '') +
        (skel > 0 ? '  <-- STUCK SKELETON' : '')
      );
      await page.screenshot({ path: `e2e-results/screens/state${route.replace(/\//g,'_')}-${mode}.png`, fullPage: true });
      await page.waitForTimeout(3500);
    }
  }
  await ctx.close();
});

test('responsive breakpoints', async ({ browser }) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);

  for (const route of ['/inventory/details', '/production', '/settings/permissions']) {
    for (const s of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width: s.width, height: s.height });
      await load(page, route);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const txt = (await page.locator('body').innerText().catch(() => '')).trim().length;
      console.log(`${route.padEnd(24)} ${s.name.padEnd(8)} ${String(s.width).padStart(4)}px hOverflow=${String(overflow).padStart(4)}px bodyLen=${txt}` +
        (overflow > 2 ? '  <-- HORIZONTAL OVERFLOW' : ''));
      await page.screenshot({ path: `e2e-results/screens/resp${route.replace(/\//g,'_')}-${s.name}.png`, fullPage: true });
      await page.waitForTimeout(3500);
    }
  }
  await ctx.close();
});
