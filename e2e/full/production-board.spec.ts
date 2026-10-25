import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test';
import type { Api } from '../fixtures/api';
import { today } from '../fixtures/dates';
import { buildWorld, type World } from '../fixtures/world';
import { KITCHEN_BRANCH_ID } from '../support/credentials';

/**
 * /production on a desktop — the kitchen's board (src/app/(app)/production).
 * One row per product; Yield and one column per branch are inputs; edits are staged and
 * saved with "Save Changes". Cells have no accessible names, so they are found by the
 * column whose header carries the label.
 */

async function finalizedOrder(api: Api, world: World, productId: number, qty: number) {
  const order = await api.post<{ id: number }>('/production-orders', {
    branchId: world.branch.id,
    date: today(),
    items: [{ productId, yield: qty }],
  });
  await api.patch(`/production-orders/${order.id}`, { status: 'FINALIZED' });
}

async function kitchenYield(api: Api, productId: number): Promise<number> {
  const rows = await api.get<Array<{ productId: number; yield: number }>>(
    `/production/branch/${KITCHEN_BRANCH_ID}/date`,
    { date: today() },
  );
  return rows.find((r) => r.productId === productId)?.yield ?? 0;
}

async function branchDelivery(api: Api, world: World, productId: number): Promise<number> {
  const rows = await api.get<Array<{ productId: number; delivery: number }>>(
    `/inventory/branch/${world.branch.id}/date`,
    { date: today() },
  );
  return rows.find((r) => r.productId === productId)?.delivery ?? 0;
}

async function cellInput(page: Page, product: string, header: string | RegExp) {
  await expect(page.getByRole('cell', { name: product, exact: true })).toBeVisible();
  const headers = (await page.locator('thead').first().getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
  const index = headers.findIndex((h) => (typeof header === 'string' ? h === header : header.test(h)));
  expect(index, `column ${header} not found in ${headers.join(' | ')}`).toBeGreaterThan(-1);
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: product, exact: true }) });
  return row.getByRole('cell').nth(index).locator('input');
}

test.describe('production board (desktop)', () => {
  test('yield and a branch quantity are saved together', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await finalizedOrder(api, world, p.id, 10);

    await page.goto('/production');
    const yieldInput = await cellInput(page, p.name, 'Yield');
    // Regression: the yield auto-fill used to add the plan on top of the 10 finalizing had
    // already booked when the orders loaded after the rows, staging 20.
    await expect(yieldInput).toHaveValue('10');
    await yieldInput.fill('12');
    const branchInput = await cellInput(page, p.name, new RegExp(`^${world.branch.name}`));
    await branchInput.fill('11');

    const saved = Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/production/upsert-bulk')),
      page.waitForResponse((r) => r.url().includes('/api/v1/inventory/bulk') && r.request().method() === 'PATCH'),
    ]);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    for (const r of await saved) expect(r.ok()).toBe(true);

    expect(await kitchenYield(api, p.id)).toBe(12);
    expect(await branchDelivery(api, world, p.id)).toBe(11);
  });

  test('a branch given more than the yield blocks the save', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await finalizedOrder(api, world, p.id, 10);

    await page.goto('/production');
    const yieldInput = await cellInput(page, p.name, 'Yield');
    await yieldInput.fill('8');
    await expect(page.getByText(/Cannot save — over-allocated/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });
});
