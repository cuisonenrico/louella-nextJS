import { randomBytes } from 'node:crypto';
import type { Page, Route } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { today, yesterday } from '../fixtures/dates';
import { buildWorld } from '../fixtures/world';

/**
 * The app shell's modernization pass (MODERNIZATION_AUDIT.md): how pages announce
 * themselves, what shows while a page loads, what a crashing page leaves on screen,
 * buttons that wait for their write, and charts that load after the page.
 */

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const slow = (ms: number) => async (route: Route) => {
  await new Promise((r) => setTimeout(r, ms));
  await route.continue().catch(() => {});
};

test.describe('app shell', () => {
  test('the active page is marked for screen readers and named in the browser tab', async ({ page }) => {
    await page.goto('/inventory/details');
    await expect(sidebar(page).getByRole('button', { name: 'Inventory', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(sidebar(page).getByRole('button', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current');
    await expect(page).toHaveTitle('Inventory Details · Louella Bakery');

    await page.goto('/suppliers');
    await expect(page).toHaveTitle('Suppliers · Louella Bakery');
  });

  test('a keyboard user can skip the sidebar straight to the page', async ({ page, browserName }) => {
    await page.goto('/dashboard');
    await expect(sidebar(page)).toBeVisible();
    // WebKit, like Safari, moves Tab past links unless Option is held.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('while the next page loads, the clicked menu item shows it is working', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(sidebar(page)).toBeVisible();
    // Hold the next page's payload, as on a weak signal. The old page stays up meanwhile
    // (Next keeps it until the new one is ready), so the menu item is the only feedback.
    await page.route('**/*', (route) => {
      const h = route.request().headers();
      const pageSegment = h['rsc'] && (!h['next-router-prefetch'] || (h['next-router-segment-prefetch'] ?? '').includes('__PAGE__'));
      return pageSegment ? slow(2_500)(route) : route.continue();
    });

    const suppliers = sidebar(page).getByRole('button', { name: 'Suppliers', exact: true });
    await suppliers.click();
    await expect(suppliers).toHaveAttribute('aria-busy', 'true');
    await expect(sidebar(page).getByText('Loading page')).toBeAttached();
    await expect(page).toHaveTitle('Suppliers · Louella Bakery', { timeout: 15_000 });
    await expect(suppliers).not.toHaveAttribute('aria-busy');
    await expect(suppliers).toHaveAttribute('aria-current', 'page');
  });

  test('a page that crashes keeps the menu and can be retried', async ({ page }) => {
    // A malformed response makes the suppliers page throw while rendering.
    const malformed = /\/api\/v1\/suppliers(\?|$)/;
    await page.route(malformed, (route) => (route.request().method() === 'GET' ? route.fulfill({ json: {} }) : route.continue()));
    await page.goto('/suppliers');

    const alert = page.getByRole('alert').filter({ hasText: 'This page ran into a problem' });
    await expect(alert).toBeVisible();
    await expect(sidebar(page)).toBeVisible();

    await page.unroute(malformed);
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.locator('#main-content').getByRole('table')).toBeVisible();
  });
});

test.describe('loading and pending states', () => {
  test('cash reports show a placeholder table while the summary loads', async ({ page }) => {
    await page.route('**/api/v1/branch-cash/summary**', slow(2_000));
    await page.goto('/branch-cash');
    await expect(page.locator('#main-content').getByRole('status', { name: 'Loading', exact: true })).toBeVisible();
    await expect(page.getByText(/days unverified/)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#main-content').getByRole('status', { name: 'Loading', exact: true })).toHaveCount(0);
  });

  test('expense category controls wait for the previous change to save', async ({ api, page }) => {
    const name = `E2E Cat ${randomBytes(3).toString('hex')}`;
    await api.post('/branch-cash/categories', { name });
    await page.route('**/api/v1/branch-cash/categories/*', (route) =>
      route.request().method() === 'PATCH' ? slow(2_000)(route) : route.continue(),
    );

    await page.goto('/branch-cash');
    await page.getByRole('button', { name: 'Categories' }).click();
    const dialog = page.getByRole('dialog');
    const row = dialog.getByRole('listitem').filter({ has: page.getByRole('textbox', { name: `Name of ${name}` }) });
    await row.getByRole('switch').first().click();

    // While it saves, a second toggle or a reorder would race it.
    await expect(row.getByRole('switch').first()).toBeDisabled();
    await expect(row.getByRole('switch').last()).toBeDisabled();
    await expect(row.getByRole('switch').first()).toBeEnabled({ timeout: 15_000 });
  });

  test('a holiday delete cannot be sent twice', async ({ api, page }) => {
    // Next year, so no cutoff another test pays is touched.
    const year = Number(today().slice(0, 4)) + 1;
    const day = String(1 + (randomBytes(1)[0] % 28)).padStart(2, '0');
    const month = String(1 + (randomBytes(1)[0] % 12)).padStart(2, '0');
    const name = `E2E Holiday ${randomBytes(3).toString('hex')}`;
    const existing = await api.get<Array<{ id: number; date: string }>>('/payroll/holidays', { year });
    for (const h of existing.filter((x) => x.date.slice(0, 10) === `${year}-${month}-${day}`)) {
      await api.raw('DELETE', `/payroll/holidays/${h.id}`);
    }
    await api.post('/payroll/holidays', { date: `${year}-${month}-${day}`, name, type: 'SPECIAL' });

    await page.route('**/api/v1/payroll/holidays/*', (route) =>
      route.request().method() === 'DELETE' ? slow(2_000)(route) : route.continue(),
    );
    await page.goto('/settings/payroll');
    await page.getByRole('button', { name: 'Next year' }).click();
    const del = page.getByRole('button', { name: `Delete ${name}` });
    page.once('dialog', (d) => d.accept());
    await del.click();
    await expect(del).toBeDisabled();
    await expect(page.getByRole('button', { name: `Delete ${name}` })).toHaveCount(0, { timeout: 15_000 });
  });
});

test.describe('charts', () => {
  test('the dashboard revenue chart loads after the page and draws', async ({ api, page }) => {
    // Two counted days, so the 7-day trend has something to draw.
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    for (const date of [yesterday(), today()]) {
      const [row] = await api.post<Array<{ id: number }>>('/inventory/bulk', [
        { branchId: world.branch.id, productId: p.id, date, quantity: 0, delivery: 10, reject: 0 },
      ]);
      await api.patch('/inventory/bulk', [{ id: row.id, leftover: 2 }]);
    }

    await page.goto('/dashboard');
    const trend = page.getByTestId('dashboard-charts-row').locator('.recharts-surface').first();
    await expect(trend).toBeVisible();
    await expect(page.getByRole('status', { name: 'Loading chart' })).toHaveCount(0);
  });
});
