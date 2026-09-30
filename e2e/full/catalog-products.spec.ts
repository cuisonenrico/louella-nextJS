import dayjs from 'dayjs';
import { test, expect } from '../fixtures/test';
import { addDays, today } from '../fixtures/dates';
import { uniqueName } from '../fixtures/names';
import { ProductsPage } from '../pages/products.page';

interface Product {
  id: number;
  name: string;
  type: string;
  price: number;
  isActive: boolean;
}
interface PriceRow {
  price: number;
  effectiveAt: string;
}

const fmt = (isoDay: string) => dayjs(isoDay).format('MMM D, YYYY');

/**
 * Products (src/app/(app)/products). Setup goes through the API; the checks that do not depend on the
 * three known bugs at the bottom read the API or fresh dialogs, so they stay meaningful while those
 * bugs exist. Each bug has its own `test.fail`: it passes while the bug is there and turns red the
 * moment it is fixed — remove its `test.fail` then.
 */
test.describe('catalog: products @stress', () => {
  test('create: the row appears, and the launch price is recorded from the launch day', async ({ api, page }) => {
    const name = uniqueName('Pandesal');
    const launch = addDays(today(), -3);
    const products = new ProductsPage(page);
    await products.open();
    await products.openCreate();
    await products.fill({ name, type: 'CAKE', price: '35.5', launch });
    expect((await products.save()).status).toBe(201);

    await products.search(name);
    const row = products.row(name);
    await expect(row).toBeVisible();
    await expect(row.getByText('CAKE', { exact: true })).toBeVisible();
    await expect(row.getByText('₱35.50')).toBeVisible();
    await expect(row.getByText('Active', { exact: true })).toBeVisible();

    // Stored, with its opening price effective from the launch day (not from today).
    const stored = (await api.get<Product[]>('/products')).find((p) => p.name === name)!;
    expect(stored).toMatchObject({ type: 'CAKE', price: 35.5, isActive: true });
    const history = await api.get<PriceRow[]>(`/products/${stored.id}/price-history`);
    expect(history.map((h) => [h.price, h.effectiveAt.slice(0, 10)])).toEqual([[35.5, launch]]);
  });

  test('a name is required, and a negative price is refused by the server — nothing is created', async ({ api, page }) => {
    const products = new ProductsPage(page);
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/v1\/products$/.test(r.url())) posts.push(r.url());
    });
    await products.open();
    await products.openCreate();

    // Empty name: the form says so without calling the server.
    await products.saveButton.click();
    await expect(products.formError).toContainText('Product name is required.');
    expect(posts).toEqual([]);

    // A negative price gets as far as the server, which refuses it, and the dialog shows why.
    const name = uniqueName('Negative');
    await products.fill({ name, price: '-5' });
    expect((await products.save()).status).toBe(400);
    await expect(products.formError).toContainText(/price/i);
    expect((await api.get<Product[]>('/products')).some((p) => p.name === name)).toBe(false);
  });

  test('a price change is recorded from today and the launch price stays on its own day', async ({ api, page }) => {
    const launch = addDays(today(), -3);
    const name = uniqueName('Repriced');
    const made = await api.post<Product>('/products', { name, type: 'BREAD', price: 20, date: launch });
    const products = new ProductsPage(page);
    await products.open();
    await products.search(name);

    await products.openEdit(name);
    await products.fill({ price: '25' });
    expect((await products.save()).status).toBe(200);

    // The record (newest first): today at the new price, then the launch day at the old one.
    const history = await api.get<PriceRow[]>(`/products/${made.id}/price-history`);
    expect(history.map((h) => [h.price, h.effectiveAt.slice(0, 10)])).toEqual([
      [25, today()],
      [20, launch],
    ]);
    // …and the dialog's Price History tab shows the same two rows.
    await products.openEdit(name);
    await products.openPriceHistory();
    await expect(products.priceHistoryRows()).toHaveCount(2);
    await expect(products.priceHistoryRows().nth(0)).toContainText(fmt(today()));
    await expect(products.priceHistoryRows().nth(0)).toContainText('₱25.00');
    await expect(products.priceHistoryRows().nth(1)).toContainText(fmt(launch));
    await expect(products.priceHistoryRows().nth(1)).toContainText('₱20.00');
  });

  test('editing only the name records no new price', async ({ api, page }) => {
    const name = uniqueName('Renamed');
    const made = await api.post<Product>('/products', { name, type: 'BREAD', price: 18, date: addDays(today(), -2) });
    const products = new ProductsPage(page);
    await products.open();
    await products.search(name);

    await products.openEdit(name);
    await products.fill({ name: `${name} v2` });
    expect((await products.save()).status).toBe(200);

    const stored = (await api.get<Product[]>('/products')).find((p) => p.id === made.id)!;
    expect(stored.name).toBe(`${name} v2`);
    expect(await api.get<PriceRow[]>(`/products/${made.id}/price-history`)).toHaveLength(1);
  });

  test('delete is a soft delete: gone from the API, not from the database', async ({ api, page }) => {
    const name = uniqueName('Doomed');
    const made = await api.post<Product>('/products', { name, type: 'BREAD', price: 12, date: addDays(today(), -1) });
    const products = new ProductsPage(page);
    await products.open();
    await products.search(name);
    await expect(products.row(name)).toBeVisible();

    await products.remove(name);
    expect((await api.raw('GET', `/products/${made.id}`)).status()).toBe(404);
    expect((await api.get<Product[]>('/products')).some((p) => p.id === made.id)).toBe(false);
  });

  // ── Known bugs, each with its own expected-to-fail test ─────────────────────────────────────

  // BUG 1. Save is not guarded against a double click: two POSTs go out before the button disables,
  // and there is no idempotency key (the production-order dialog has one for exactly this).
  test('a double-click on Save creates one product, not two', async ({ api, page }) => {
    test.fail(true, 'products dialog: no idempotency key, so a double click creates a duplicate');
    const name = uniqueName('Once');
    const products = new ProductsPage(page);
    await products.open();
    await products.openCreate();
    await products.fill({ name, price: '10' });

    // Two clicks in one tick — what a fast double-click is — so it does not depend on the browser's timing.
    await products.saveButton.evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await expect(products.dialog).toHaveCount(0);
    await page.waitForLoadState('networkidle');

    expect((await api.get<Product[]>('/products')).filter((p) => p.name === name)).toHaveLength(1);
  });

  // BUG 2. GET /products is sent with `Cache-Control: private, max-age=60`, so after any add / edit /
  // delete the app's own refetch is answered from the browser cache and the page shows stale data for up
  // to a minute (and the Edit form, filled from that stale row, would send the OLD price back).
  test('the list is up to date straight after a change, without reloading', async ({ api, page }) => {
    test.fail(true, 'GET /products is browser-cached for 60 s, so the refetch after a save/delete is stale');
    const name = uniqueName('Fresh');
    await api.post<Product>('/products', { name, type: 'BREAD', price: 12, date: addDays(today(), -1) });
    const products = new ProductsPage(page);
    await products.open();
    await products.search(name);

    await products.openEdit(name);
    await products.fill({ price: '30' });
    expect((await products.save()).status).toBe(200);
    await expect(products.row(name).getByText('₱30.00')).toBeVisible();

    await products.remove(name);
    await expect(products.row(name)).toHaveCount(0);
  });

  // BUG 3. "Inactive" is a one-way door: GET /products lists only ACTIVE products (so the row vanishes
  // from the page that has an "Inactive" badge for it) and findOne() only finds active ones (so an inactive
  // product cannot be edited — PATCH 404s — and can therefore never be switched back).
  test('a product set to Inactive stays listed as Inactive, and can be switched back', async ({ api, page }) => {
    test.fail(true, 'inactive products disappear from /products and PATCH /products/:id 404s for them');
    const name = uniqueName('Retired');
    const made = await api.post<Product>('/products', { name, type: 'BREAD', price: 9, date: addDays(today(), -1) });
    const products = new ProductsPage(page);
    await products.open();
    await products.search(name);

    await products.openEdit(name);
    await products.fill({ status: 'Inactive' });
    expect((await products.save()).status).toBe(200);
    await expect(products.row(name).getByText('Inactive', { exact: true })).toBeVisible();

    // Switching it back works.
    const back = await api.raw('PATCH', `/products/${made.id}`, { isActive: true });
    expect(back.status()).toBe(200);
  });
});
