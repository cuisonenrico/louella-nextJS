import { randomBytes } from 'node:crypto';
import type { Page, Route } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';

/**
 * /inventory-import/history — the delete button follows the key its endpoint checks
 * (`inventory-import:delete-log`), not the role. It used to show for every ADMIN, so an
 * admin whose key was revoked got a button that always answered 403.
 *
 * A log exists only after importing a real client workbook, so the list response is
 * stubbed here: what is under test is which controls the page renders for an account.
 */
const LOG = {
  id: 999_001,
  branchId: 1,
  fileName: 'stub-workbook.xlsx',
  fileHash: 'stub',
  importedBy: null,
  importedAt: new Date().toISOString(),
  sheetCount: 1,
  rowCount: 3,
  skippedCount: 0,
  status: 'SUCCESS',
  notes: null,
  branch: { name: 'Stub Branch' },
  importedByUser: null,
};

async function stubLogs(page: Page) {
  await page.route('**/api/v1/inventory-import/logs**', (route: Route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { total: 1, page: 1, limit: 20, items: [LOG] } })
      : route.continue(),
  );
}

const deleteButton = (page: Page) => page.getByRole('row', { name: /stub-workbook\.xlsx/ }).locator('button:has(svg.lucide-trash-2)');

test.describe('import history delete control', () => {
  test('an admin holding inventory-import:delete-log sees the delete button', async ({ page }) => {
    await stubLogs(page);
    await page.goto('/inventory-import/history');
    await expect(deleteButton(page)).toBeVisible();
  });

  test('an admin whose inventory-import:delete-log was revoked does not', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 0 });
    const email = `e2e-admin-${randomBytes(3).toString('hex')}@louella.test`;
    const admin = await api.post<{ id: number }>('/users', {
      email,
      password: world.manager.password,
      role: 'ADMIN',
      mustChangePassword: false,
    });
    await api.put(`/permissions/users/${admin.id}`, { featureKey: 'inventory-import:delete-log', enabled: false });

    const page = await managerPage(browser, { ...world, manager: { id: admin.id, email, password: world.manager.password } });
    await stubLogs(page);
    await page.goto('/inventory-import/history');
    await expect(page.getByRole('cell', { name: 'stub-workbook.xlsx' })).toBeVisible();
    await expect(deleteButton(page)).toHaveCount(0);
    await page.context().close();
  });
});
