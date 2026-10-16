import { devices, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/test';
import type { Api } from '../../fixtures/api';
import { today } from '../../fixtures/dates';
import { buildWorld, managerPage, type World } from '../../fixtures/world';
import { PhoneCount } from '../../pages/phone-count.page';

const PHONE = devices['Pixel 7'];
const BULK = '**/api/v1/inventory/bulk';

type Row = { id: number; productId: number; delivery: number; leftover: number; reject: number; leftoverCountedAt: string | null };

async function rowFor(api: Api, world: World, productId: number): Promise<Row> {
  const rows = await api.get<Row[]>(`/inventory/branch/${world.branch.id}/date`, { date: today() });
  return rows.find((r) => r.productId === productId)!;
}

/**
 * A world whose products already have stock: one finalized order of `delivery` each (finalizing opens
 * the day's rows), then the phone sheet. Products are global, so other tests' products appear too —
 * Initialize them if offered, and never assume the list holds only this world's products.
 */
async function setup(api: Api, browser: Parameters<typeof managerPage>[0], products = 2, delivery = 20) {
  const world = await buildWorld(api, { products });
  await finalizedOrder(api, world, world.products.map((p) => [p.id, delivery]));
  const page = await managerPage(browser, world, PHONE);
  const count = new PhoneCount(page);
  await count.open();
  if (await count.initializeButton().isVisible()) await count.initialize();
  for (const p of world.products) await expect(count.row(p.name)).toBeVisible();
  return { world, page, count };
}

const peso = (n: number) => `₱${n.toLocaleString()}`;

async function finalizedOrder(api: Api, world: World, items: Array<[number, number]>) {
  const order = await api.post<{ id: number }>('/production-orders', {
    branchId: world.branch.id,
    date: today(),
    items: items.map(([productId, qty]) => ({ productId, yield: qty })),
  });
  await api.patch(`/production-orders/${order.id}`, { status: 'FINALIZED' });
}

const goOnline = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('online')));

test.describe('phone count', () => {
  test('uninitialized products offer Initialize, not the sheet', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 2 });
    const page = await managerPage(browser, world, PHONE);
    const count = new PhoneCount(page);
    await count.open();
    await expect(count.initializeButton()).toHaveText(/^Initialize \d+ rows$/);
    await expect(count.row(world.products[0].name)).toHaveCount(0);
    await page.context().close();
  });

  test('counts a product through the sheet and moves to the next', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser);
    const [p1] = world.products;

    await count.openProduct(p1.name);
    await count.set('Leftover', 4);
    await count.set('Reject', 1);
    await count.saveAndNext();
    // The sheet moves on to the next product in the list (which may belong to another test).
    await expect(count.sheet(p1.name)).toBeHidden();
    await expect(count.sheet()).toBeVisible();
    await count.expectSaved();

    await expect.poll(async () => (await rowFor(api, world, p1.id)).leftover).toBe(4);
    const row = await rowFor(api, world, p1.id);
    expect(row.reject).toBe(1);
    expect(row.leftoverCountedAt).not.toBeNull();
    await page.keyboard.press('Escape');
    await expect(count.rowField(p1.name, 'leftover')).toHaveText('4');
    await expect(page.getByText(/^1 of \d+ counted$/)).toBeVisible();
    await page.context().close();
  });

  test('a delivery that matches the order, then corrected to what arrived', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser, 1, 24);
    const p = world.products[0];

    const sheet = await count.openProduct(p.name);
    await expect(sheet.getByText('✓ matches order')).toBeVisible();
    await count.differentCount();
    await count.set('Delivery received', 22);
    await expect(sheet.getByText('Ordered 24')).toBeVisible();
    await expect(sheet.getByText('2 short')).toBeVisible();
    await count.saveAndNext();
    await count.expectSaved();
    await expect.poll(async () => (await rowFor(api, world, p.id)).delivery).toBe(22);
    await page.context().close();
  });

  test('shows the stock value and no revenue to a manager', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser, 1, 10);
    const p = world.products[0];

    await expect(count.rowField(p.name, 'stockValue')).toHaveText(peso(10 * p.price));
    const sheet = await count.openProduct(p.name);
    await expect(sheet.getByText(peso(10 * p.price))).toBeVisible();
    await count.set('Leftover', 3);
    await expect(sheet.getByText('Sold 7', { exact: true })).toBeVisible();
    await expect(page.getByText(/revenue/i)).toHaveCount(0);
    await expect(sheet.getByText(peso(7 * p.price))).toHaveCount(0);
    await page.context().close();
  });

  test('a count saved without signal is sent when the signal returns', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser, 1);
    const p = world.products[0];

    await page.context().setOffline(true);
    await count.openProduct(p.name);
    await count.set('Leftover', 3);
    await count.saveAndNext();
    await expect(count.sync()).toContainText('● 1 waiting for signal');
    await page.keyboard.press('Escape');
    await expect(count.rowField(p.name, 'leftover')).toHaveText('3');

    await page.context().setOffline(false);
    await goOnline(page);
    await count.expectSaved();
    await expect.poll(async () => (await rowFor(api, world, p.id)).leftover).toBe(3);
    await page.context().close();
  });

  test('a queued count survives a reload', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser, 1);
    const p = world.products[0];

    await page.route(BULK, (route) => (route.request().method() === 'PATCH' ? route.abort() : route.continue()));
    await count.openProduct(p.name);
    await count.set('Leftover', 6);
    await count.saveAndNext();
    await expect(count.sync()).toContainText('waiting for signal');

    await page.reload();
    await expect(count.rowField(p.name, 'leftover')).toHaveText('6');
    await page.unroute(BULK);
    await goOnline(page);
    await count.expectSaved();
    await expect.poll(async () => (await rowFor(api, world, p.id)).leftover).toBe(6);
    await page.context().close();
  });

  test('a count the server refuses is shown and can be discarded', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser, 1);
    const p = world.products[0];

    await page.route(BULK, (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Bad value' }) })
        : route.continue(),
    );
    await count.openProduct(p.name);
    await count.set('Leftover', 5);
    await count.saveAndNext();
    await expect(count.sync()).toContainText("1 couldn't save");
    // Save & next may have opened another product's sheet; the chip is on the page behind it.
    await page.keyboard.press('Escape');
    await expect(count.sheet()).toBeHidden();

    await count.sync().getByRole('button', { name: /couldn't save/ }).click();
    await expect(page.getByText(`${p.name}: Bad value`)).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).click();
    await count.expectSaved();
    // Nothing reached the server: the row is still uncounted.
    await expect(count.rowField(p.name, 'leftover')).toHaveText('–');
    expect((await rowFor(api, world, p.id)).leftoverCountedAt).toBeNull();
    await page.context().close();
  });

  test('logging out with counts still queued asks first', async ({ api, browser }) => {
    const { world, page, count } = await setup(api, browser, 1);
    const p = world.products[0];

    await page.context().setOffline(true);
    await count.openProduct(p.name);
    await count.set('Leftover', 2);
    await count.saveAndNext();
    await page.keyboard.press('Escape');
    await expect(count.sync()).toContainText('1 waiting for signal');

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Logout' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask).toContainText("1 count hasn't reached the server yet");
    await ask.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(/\/inventory\/details/);
    await expect(count.sync()).toContainText('1 waiting for signal');
    await page.context().close();
  });
});
