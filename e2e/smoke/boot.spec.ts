import { expect, test } from '@playwright/test';

test('app boots against the e2e database @smoke', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  const res = await request.post('/api/v1/auth/login', {
    data: { email: 'e2e-admin@louella.test', password: 'E2e-Admin-Pass-1' },
  });
  expect(res.status()).toBe(201);
});
