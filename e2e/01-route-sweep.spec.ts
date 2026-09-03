import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import { APP_ROUTES, ADMIN } from './routes';

/**
 * Sweep every route in one session.
 *
 * Two constraints, both real app behaviour rather than harness quirks:
 *  1. /auth/refresh rotates a single-use token and takes ~2s. Navigating
 *     before it lands kills the session (BUG-001), so each load waits for it.
 *  2. /auth/refresh is throttled to 10/min, and one fires per full page load,
 *     so loads are paced ~7s apart (BUG-002).
 */
type Finding = {
  route: string; consoleErrors: string[]; consoleWarnings: string[];
  pageErrors: string[]; badResponses: string[]; brokenImages: string[];
  loadMs: number; skeletons: number; spinners: number; finalUrl: string; bodyTextLen: number;
};

const IGNORE = [/favicon/i, /React DevTools/i, /\[Fast Refresh\]/i, /webpack-hmr|_next\/static\/webpack/i];
const isNoise = (s: string) => IGNORE.some((r) => r.test(s));

test('sweep every app route', async ({ browser }) => {
  test.setTimeout(900_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const findings: Finding[] = [];
  let cur: Finding | null = null;

  page.on('console', (m) => {
    const t = m.text(); if (isNoise(t) || !cur) return;
    if (m.type() === 'error') cur.consoleErrors.push(t.slice(0, 300));
    if (m.type() === 'warning') cur.consoleWarnings.push(t.slice(0, 300));
  });
  page.on('pageerror', (e) => cur?.pageErrors.push(String(e.message).slice(0, 300)));
  page.on('response', (r) => {
    if (cur && r.status() >= 400 && !isNoise(r.url()))
      cur.badResponses.push(`${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:4000','')}`);
  });

  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });

  for (const route of APP_ROUTES) {
    cur = { route, consoleErrors: [], consoleWarnings: [], pageErrors: [], badResponses: [],
            brokenImages: [], loadMs: 0, skeletons: 0, spinners: 0, finalUrl: '', bodyTextLen: 0 };
    const t0 = Date.now();
    const refreshDone = page.waitForResponse((r) => r.url().includes('/auth/refresh'), { timeout: 30_000 }).catch(() => null);
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await refreshDone;                 // never navigate mid-rotation
    await page.waitForTimeout(3000);   // let queries settle
    cur.loadMs = Date.now() - t0;
    cur.finalUrl = new URL(page.url()).pathname;
    cur.skeletons = await page.locator('.animate-pulse:visible').count();
    cur.spinners = await page.locator('.animate-spin:visible').count();
    cur.bodyTextLen = (await page.locator('body').innerText().catch(() => '')).trim().length;
    cur.brokenImages = await page.evaluate(() =>
      Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.src).map((i) => i.src));
    await page.screenshot({ path: `e2e-results/screens/${route.replace(/\//g,'_')||'root'}.png`, fullPage: true });
    findings.push(cur);
    await page.waitForTimeout(4000);   // stay under the 10/min refresh throttle
  }

  fs.mkdirSync('e2e-results', { recursive: true });
  fs.writeFileSync('e2e-results/sweep.json', JSON.stringify(findings, null, 2));
  await ctx.close();
  expect(findings.filter((f) => f.pageErrors.length).map((f) => f.route)).toEqual([]);
});
