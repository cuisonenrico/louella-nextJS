import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('a failed login does not destroy the document', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/login');

  // Survives a client-side navigation; wiped by a real page load.
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__probe = 'alive'; });

  await page.locator('input[type="email"]').first().fill('admin@louella.com');
  await page.locator('input[type="password"]').first().fill('DefinitelyWrong!123');
  await page.getByRole('button', { name: /sign in|log ?in/i }).first().click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);

  const probe = await page.evaluate(() => (window as unknown as Record<string, unknown>).__probe);
  const navType = await page.evaluate(
    () => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type
  );
  console.log(`  window.__probe after failed login: ${probe ?? '(GONE — document was reloaded)'}`);
  console.log(`  navigation type: ${navType}`);
  expect(probe).toBe('alive');
});
