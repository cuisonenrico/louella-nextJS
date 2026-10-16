import { devices, type Locator, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/test';
import type { Api } from '../../fixtures/api';
import { today, yesterday } from '../../fixtures/dates';
import { buildWorld, managerPage, type World } from '../../fixtures/world';
import { PhoneCount } from '../../pages/phone-count.page';

const PHONE = devices['Pixel 7'];

/** Yesterday's counted sales for the world's products, so "Last 7 days" has something to suggest. */
async function salesHistory(api: Api, world: World) {
  const created = await api.post<Array<{ id: number }>>(
    '/inventory/bulk',
    world.products.map((p) => ({ branchId: world.branch.id, productId: p.id, date: yesterday(), quantity: 0, delivery: 30, reject: 0 })),
  );
  await api.patch('/inventory/bulk', created.map((r) => ({ id: r.id, leftover: 5 })));
}

async function draftOrder(api: Api, world: World, productId: number, qty: number) {
  return api.post<{ id: number }>('/production-orders', {
    branchId: world.branch.id,
    date: today(),
    items: [{ productId, yield: qty }],
  });
}

async function openOrders(page: Page) {
  await page.goto('/production/orders');
  await expect(page.getByRole('button', { name: /New order/ })).toBeVisible();
}

const form = (page: Page) => page.getByRole('region', { name: /New order|Edit PO/ });
const qty = (page: Page, product: string): Locator => form(page).getByRole('textbox', { name: product, exact: true });
const card = (page: Page, id: number) => page.getByRole('article', { name: `PO #${id}` });

test.describe('phone Branch Orders', () => {
  test('fill from suggestions, adjust, save and finalize', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await salesHistory(api, world);
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);

    await page.getByRole('button', { name: /New order/ }).click();
    await form(page).getByRole('button', { name: 'Fill all from suggestions' }).click();
    const chip = form(page).getByRole('button', { name: new RegExp(`^Use suggested \\d+ for ${p.name}$`) });
    const suggested = Number((await chip.getAttribute('aria-label'))!.match(/\d+/)![0]);
    expect(suggested).toBeGreaterThan(0);
    await expect(qty(page, p.name)).toHaveValue(String(suggested));
    await form(page).getByRole('button', { name: `Increase ${p.name}` }).click();
    await expect(qty(page, p.name)).toHaveValue(String(suggested + 1));

    const created = page.waitForResponse((r) => r.url().endsWith('/api/v1/production-orders') && r.request().method() === 'POST');
    await form(page).getByRole('button', { name: 'Save draft' }).click();
    const order = (await (await created).json()) as { id: number };
    await expect(card(page, order.id)).toContainText('Draft');

    await card(page, order.id).getByRole('button', { name: 'Finalize' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Finalize' }).click();
    await expect(card(page, order.id)).toContainText('Finalized');

    // The count sheet now sees the delivery the order booked.
    await page.getByRole('navigation', { name: 'Phone navigation' }).getByRole('link', { name: /Count/ }).click();
    const count = new PhoneCount(page);
    const sheet = await count.openProduct(p.name);
    await expect(sheet.getByText('✓ matches order')).toBeVisible();
    await expect(sheet.getByText(`Deliv ${suggested + 1}`)).toBeVisible();
    await page.context().close();
  });

  test('an unsaved order is restored after a reload', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);

    await page.getByRole('button', { name: /New order/ }).click();
    await qty(page, p.name).fill('7');
    await page.reload(); // straight away: what was typed is already on the phone
    await page.getByRole('button', { name: /New order/ }).click();
    await expect(form(page).getByText(/Restored your unsaved order from/)).toBeVisible();
    await expect(qty(page, p.name)).toHaveValue('7');

    await form(page).getByRole('button', { name: 'Discard' }).click();
    await expect(qty(page, p.name)).toHaveValue('0');
    await page.context().close();
  });

  test('Finalize saves edits first and keeps the draft when the save fails', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const order = await draftOrder(api, world, p.id, 5);
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);

    await card(page, order.id).getByRole('button', { name: 'Edit' }).click();
    await qty(page, p.name).fill('9');
    await page.route('**/api/v1/production-orders/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Server unavailable' }) })
        : route.continue(),
    );
    await form(page).getByRole('button', { name: 'Finalize' }).click();
    await expect(page.getByText('Server unavailable').first()).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.unroute('**/api/v1/production-orders/*');

    await form(page).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Keep on this phone' }).click();
    await expect(card(page, order.id)).toContainText('Draft');
    await card(page, order.id).getByRole('button', { name: 'Edit' }).click();
    await expect(form(page).getByText(/Restored your unsaved order from/)).toBeVisible();
    await expect(qty(page, p.name)).toHaveValue('9');
    await page.context().close();
  });

  test('Cancel and Delete live under the menu', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const order = await draftOrder(api, world, world.products[0].id, 3);
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);

    const c = card(page, order.id);
    await expect(c.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(c.getByRole('button', { name: 'Finalize' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await c.getByRole('button', { name: 'More actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Cancel order' })).toBeVisible();
    // A manager has no delete grant by default, so Delete is not offered at all.
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await page.context().close();
  });

  test('closing a changed order asks, and Finalize on its card reopens the unsaved edits', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const order = await draftOrder(api, world, p.id, 5);
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);

    await card(page, order.id).getByRole('button', { name: 'Edit' }).click();
    await qty(page, p.name).fill('8');
    await form(page).getByRole('button', { name: 'Close' }).click();
    const ask = page.getByRole('alertdialog');
    await expect(ask).toContainText('not saved');
    await ask.getByRole('button', { name: 'Keep on this phone' }).click();
    await expect(card(page, order.id)).toContainText('Draft');

    // Finalizing from the card would book the server's 5; it opens the edits instead.
    await card(page, order.id).getByRole('button', { name: 'Finalize' }).click();
    await expect(form(page)).toBeVisible();
    await expect(qty(page, p.name)).toHaveValue('8');
    await page.context().close();
  });

  test('the New order button never covers the last card', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    for (let i = 0; i < 4; i++) await draftOrder(api, world, world.products[0].id, i + 1);
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);
    await page.mouse.wheel(0, 5000);
    const last = page.getByRole('article').last().getByRole('button', { name: 'Finalize' });
    await last.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    const a = (await last.boundingBox())!;
    const b = (await page.getByRole('button', { name: /New order/ }).boundingBox())!;
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(overlap).toBe(false);
    await page.context().close();
  });

  test('without sales history the form says why there are no suggestions', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const page = await managerPage(browser, world, PHONE);
    await openOrders(page);
    await page.getByRole('button', { name: /New order/ }).click();
    await expect(form(page).getByText('No sales in this period to suggest from.')).toBeVisible();
    await expect(form(page).getByRole('button', { name: 'Fill all from suggestions' })).toBeDisabled();
    await page.context().close();
  });
});
