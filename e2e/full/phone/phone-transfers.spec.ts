import { devices, type Page } from '@playwright/test';
import { test, expect } from '../../fixtures/test';
import type { Api } from '../../fixtures/api';
import { today } from '../../fixtures/dates';
import { buildWorld, managerPage, type World } from '../../fixtures/world';
import { PhoneCount } from '../../pages/phone-count.page';

const PHONE = devices['Pixel 7'];

type Adj = { type: string; value: number; notes: string | null; transferStatus?: string | null };
type Row = { productId: number; adjustments?: Adj[] };

async function adjustmentsFor(api: Api, world: World, productId: number): Promise<Adj[]> {
  const rows = await api.get<Row[]>(`/inventory/branch/${world.branch.id}/date`, { date: today() });
  return rows.find((r) => r.productId === productId)?.adjustments ?? [];
}

async function stock(api: Api, world: World, productId: number, qty: number) {
  const order = await api.post<{ id: number }>('/production-orders', {
    branchId: world.branch.id,
    date: today(),
    items: [{ productId, yield: qty }],
  });
  await api.patch(`/production-orders/${order.id}`, { status: 'FINALIZED' });
}

async function phoneFor(browser: Parameters<typeof managerPage>[0], world: World) {
  const page = await managerPage(browser, world, PHONE);
  const count = new PhoneCount(page);
  await count.open();
  return { page, count };
}

/** Open the product's sheet, then its Adjust… sheet. */
async function openAdjust(page: Page, count: PhoneCount, product: string) {
  await count.openProduct(product);
  await page.getByRole('button', { name: 'Adjust…' }).click();
  const sheet = page.getByRole('dialog', { name: `${product} · adjust` });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('phone adjustments', () => {
  test('a pull-out to another branch is accepted from the receiving phone', async ({ api, browser }) => {
    const sender = await buildWorld(api, { products: 1 });
    const receiver = await buildWorld(api, { products: 0 });
    const p = sender.products[0];
    await stock(api, sender, p.id, 10);

    const s = await phoneFor(browser, sender);
    const sheet = await openAdjust(s.page, s.count, p.name);
    await sheet.getByRole('radio', { name: 'Pull Out' }).click();
    await sheet.getByRole('combobox', { name: 'To branch' }).click();
    await s.page.getByRole('option', { name: receiver.branch.name, exact: true }).click();
    await expect(sheet.getByText('Can send up to 10')).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Quantity' }).fill('4');
    const sent = s.page.waitForResponse((r) => r.url().includes('/inventory-adjustments/transfer'));
    await sheet.getByRole('button', { name: 'Send 4' }).click();
    expect((await sent).ok()).toBe(true);
    await s.page.keyboard.press('Escape');
    await s.page.keyboard.press('Escape');
    await expect(s.count.row(p.name)).toContainText('−4');
    expect(await adjustmentsFor(api, sender, p.id)).toContainEqual(
      expect.objectContaining({ type: 'PULL_OUT', value: 4, transferStatus: 'PENDING' }),
    );

    const r = await phoneFor(browser, receiver);
    await expect(r.page.getByLabel('1 transfer waiting')).toBeVisible();
    await expect(r.page.getByText(`Incoming from ${sender.branch.name}`)).toBeVisible();
    const accepted = r.page.waitForResponse((res) => res.url().includes('/accept'));
    await r.page.getByRole('button', { name: 'Accept 4' }).click();
    expect((await accepted).ok()).toBe(true);
    await expect.poll(async () => (await adjustmentsFor(api, receiver, p.id)).map((a) => [a.type, a.value])).toContainEqual([
      'PULL_IN',
      4,
    ]);
    await expect(r.page.getByLabel('1 transfer waiting')).toHaveCount(0);

    await s.page.context().close();
    await r.page.context().close();
  });

  test('a pull-in is recorded with its note', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await stock(api, world, p.id, 5);
    const { page, count } = await phoneFor(browser, world);

    const sheet = await openAdjust(page, count, p.name);
    await expect(sheet.getByRole('radio', { name: 'Pull In' })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('textbox', { name: 'Quantity' }).fill('3');
    await sheet.getByRole('textbox', { name: 'Note' }).fill('found tray');
    const created = page.waitForResponse((r) => r.url().endsWith('/inventory-adjustments') && r.request().method() === 'POST');
    await sheet.getByRole('button', { name: 'Add' }).click();
    expect((await created).ok()).toBe(true);
    await expect(sheet.getByText('found tray')).toBeVisible();
    expect(await adjustmentsFor(api, world, p.id)).toContainEqual(
      expect.objectContaining({ type: 'PULL_IN', value: 3, notes: 'found tray' }),
    );
    await page.context().close();
  });

  test('without signal the submit says Needs signal', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await stock(api, world, p.id, 5);
    const { page, count } = await phoneFor(browser, world);

    const sheet = await openAdjust(page, count, p.name);
    await sheet.getByRole('textbox', { name: 'Quantity' }).fill('2');
    await page.context().setOffline(true);
    await expect(sheet.getByRole('button', { name: 'Needs signal' })).toBeDisabled();
    await page.context().setOffline(false);
    await expect(sheet.getByRole('button', { name: 'Add' })).toBeEnabled();
    await page.context().close();
  });
});
