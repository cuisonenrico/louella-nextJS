import { test, expect } from '@playwright/test';
import { ADMIN } from './routes';

test.use({ storageState: { cookies: [], origins: [] } });

test('a 500 is not retried; a 503 still is', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(ADMIN.email);
  await page.locator('input[type="password"]').first().fill(ADMIN.password);
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });

  for (const status of [500, 503] as const) {
    let hits = 0;
    await page.unrouteAll();
    await page.route('**/api/v1/products**', (r) => {
      hits++;
      return r.fulfill({ status, contentType: 'application/json', body: '{"message":"injected"}' });
    });

    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(14_000);   // well past any backoff
    console.log(`  status ${status}: ${hits} request(s) to /products`);

    if (status === 500) {
      // Definitive: asking again cannot change the answer.
      expect(hits, 'a 500 must not be retried').toBe(1);
    } else {
      // Transient: worth retrying.
      expect(hits, 'a 503 should still be retried').toBeGreaterThan(1);
    }
  }
});
