import { devices } from '@playwright/test';
import { test, expect } from '../../fixtures/test';
import { buildWorld, managerPage } from '../../fixtures/world';

// A branch manager on their own phone. `managerPage` needs the device: a context opened from the
// test's `browser` does not inherit the project's `use`.
const PHONE = devices['Pixel 7'];

test.describe('phone shell', () => {
  test('the tab bar reaches Count, Orders, Cash and the full navigation', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const page = await managerPage(browser, world, PHONE);
    await page.goto('/inventory/details');

    const bar = page.getByRole('navigation', { name: 'Phone navigation' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: /Count/ })).toHaveAttribute('aria-current', 'page');

    await bar.getByRole('link', { name: /Orders/ }).click();
    await expect(page).toHaveURL(/\/production\/orders$/);

    await bar.getByRole('link', { name: /Cash/ }).click();
    await expect(page).toHaveURL(/\/inventory\/details\?view=cash$/);
    await expect(page.getByText('Expenses', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Counted cash')).toBeVisible();

    await bar.getByRole('button', { name: 'More' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await page.context().close();
  });
});
