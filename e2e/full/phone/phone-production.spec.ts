import { devices, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/test';
import type { Api } from '../../fixtures/api';
import { today } from '../../fixtures/dates';
import { buildWorld, managerPage, type World } from '../../fixtures/world';
import { KITCHEN_BRANCH_ID } from '../../support/credentials';
import { PhoneBoard } from '../../pages/phone-board.page';

// The `page` fixture is the admin, sized by the phone project (Pixel 7).

async function finalizedOrder(api: Api, world: World, productId: number, qty: number) {
  const order = await api.post<{ id: number }>('/production-orders', {
    branchId: world.branch.id,
    date: today(),
    items: [{ productId, yield: qty }],
  });
  await api.patch(`/production-orders/${order.id}`, { status: 'FINALIZED' });
}

async function kitchenYield(api: Api, productId: number): Promise<number> {
  const rows = await api.get<Array<{ productId: number; yield: number }>>(`/production/branch/${KITCHEN_BRANCH_ID}/date`, {
    date: today(),
  });
  return rows.find((r) => r.productId === productId)?.yield ?? 0;
}

async function branchDelivery(api: Api, world: World, productId: number): Promise<number> {
  const rows = await api.get<Array<{ productId: number; delivery: number }>>(`/inventory/branch/${world.branch.id}/date`, {
    date: today(),
  });
  return rows.find((r) => r.productId === productId)?.delivery ?? 0;
}

const goOnline = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')));

async function setup(api: Api, page: Page, qty = 10) {
  const world = await buildWorld(api, { products: 1 });
  const p = world.products[0];
  await finalizedOrder(api, world, p.id, qty);
  const board = new PhoneBoard(page);
  await board.open();
  return { world, p, board };
}

test.describe('phone production board', () => {
  test('the kitchen raises the yield and a branch share', async ({ api, page }) => {
    const { world, p, board } = await setup(api, page);
    await expect(board.rowField(p.name, 'planned')).toHaveText('10');
    await expect(board.rowField(p.name, 'yield')).toHaveText('10');

    const sheet = await board.openProduct(p.name);
    await expect(sheet.getByText('Matches plan')).toBeVisible();
    await board.set('Yield', 12);
    await board.set(world.branch.name, 12);
    await expect(sheet.getByText('2 over plan')).toBeVisible();
    await board.saveButton().click();
    await page.keyboard.press('Escape');
    await expect(board.sync()).toContainText('● Saved');
    await expect.poll(() => kitchenYield(api, p.id)).toBe(12);
    await expect.poll(() => branchDelivery(api, world, p.id)).toBe(12);
    await expect(board.rowField(p.name, 'diff')).toHaveText('+2');
  });

  test('a branch given more than the yield blocks only that product', async ({ api, page }) => {
    const { p, board } = await setup(api, page);
    const sheet = await board.openProduct(p.name);
    await board.set('Yield', 8);
    await expect(sheet.getByText('Assigned 10 of 8')).toBeVisible();
    await expect(sheet.getByText('Lower a branch to match the yield')).toBeVisible();
    await expect(board.saveButton()).toBeDisabled();
  });

  test('a yield saved without signal is sent when the signal returns', async ({ api, page }) => {
    const { p, board } = await setup(api, page);
    await page.context().setOffline(true);
    await board.openProduct(p.name);
    await board.set('Yield', 13);
    await board.saveButton().click();
    await page.keyboard.press('Escape');
    await expect(board.sync()).toContainText('waiting for signal');
    await expect(board.rowField(p.name, 'yield')).toHaveText('13');
    await page.context().setOffline(false);
    await goOnline(page);
    await expect(board.sync()).toContainText('● Saved');
    await expect.poll(() => kitchenYield(api, p.id)).toBe(13);
  });

  test('an order finalized while offline is not overwritten by the late save', async ({ api, page }) => {
    const { world, p, board } = await setup(api, page);
    await page.context().setOffline(true);
    await board.openProduct(p.name);
    await board.set('Yield', 12);
    await board.saveButton().click();
    await page.keyboard.press('Escape');
    await expect(board.sync()).toContainText('waiting for signal');

    await finalizedOrder(api, world, p.id, 5); // the server's yield is now 15
    await page.context().setOffline(false);
    await goOnline(page);
    await expect(board.sync()).toContainText("1 couldn't save");
    await board.sync().getByRole('button', { name: /couldn't save/ }).click();
    await expect(page.getByText(`${p.name}: Changed to 15 on the server — check and save again`)).toBeVisible();
    expect(await kitchenYield(api, p.id)).toBe(15);

    // Checking it: the sheet shows what the server has now, and Save without changes accepts it.
    await page.keyboard.press('Escape');
    const sheet = await board.openProduct(p.name);
    await expect(sheet.getByText('Changed to 15 on the server — check and save again')).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: 'Yield', exact: true })).toHaveValue('15');
    await board.saveButton().click();
    await page.keyboard.press('Escape');
    await expect(board.sync()).toContainText('● Saved');
    expect(await kitchenYield(api, p.id)).toBe(15);
  });

  test('a branch manager sees the board read-only', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await finalizedOrder(api, world, p.id, 10);
    const mgr = await managerPage(browser, world, devices['Pixel 7']);
    const board = new PhoneBoard(mgr);
    await board.open();
    // The kitchen's yield is not theirs to see: the list shows planned and their own share.
    await expect(mgr.getByText('Read-only — the kitchen sets the yield')).toBeVisible();
    await expect(board.rowField(p.name, 'planned')).toHaveText('10');
    await expect(board.row(p.name).locator('[data-field="share"]')).toHaveText('10');
    await expect(board.rowField(p.name, 'yield')).toHaveCount(0);
    const sheet = await board.openProduct(p.name);
    await expect(sheet.getByText('Only the kitchen changes yield and branch splits.')).toBeVisible();
    await expect(sheet.getByRole('textbox')).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: /Save & next/ })).toHaveCount(0);
    await mgr.context().close();
  });

  test('the phone leaves out expected sales and material cost', async ({ api, page }) => {
    await setup(api, page);
    await expect(page.getByText(/Exp\. Sales|Mat\. Cost|Expected Revenue/)).toHaveCount(0);
    await expect(page.getByText(/built for a wider screen/)).toHaveCount(0);
  });
});
