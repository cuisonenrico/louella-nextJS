import { test, expect } from '../fixtures/test';
import type { Api } from '../fixtures/api';
import { addDays, today, yesterday } from '../fixtures/dates';
import { buildWorld, type World } from '../fixtures/world';
import { InventorySheet } from '../pages/inventory-sheet.page';
import { ProductionOrdersPage } from '../pages/production-orders.page';
import { ProductsPage } from '../pages/products.page';
import type { SalesDay } from '../support/types';

const PRICE = 130;

/**
 * Equipment (trays, freezer…) is global like every product, so each test makes its own and retires
 * it at the end: other specs' worlds would otherwise get a row for it on Initialize.
 */
async function equipment(api: Api, world: World) {
  return api.post<{ id: number; name: string }>('/products', {
    name: `${world.branch.name} Trays`,
    type: 'MISCELLANEOUS',
    price: PRICE,
    date: addDays(today(), -30),
    isActive: true,
    isEquipment: true,
  });
}
const retire = (api: Api, id: number) => api.patch(`/products/${id}`, { isActive: false });

test.describe('branch equipment', () => {
  test('carries its count, never blocks the day, and a drop is charged as missing', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const trays = await equipment(api, world);
    try {
      // Counted yesterday: 51. Today nobody has counted it yet.
      const [y] = await api.post<Array<{ id: number }>>('/inventory/bulk', [
        { branchId: world.branch.id, productId: trays.id, date: yesterday(), quantity: 51, delivery: 0, reject: 0 },
      ]);
      await api.patch('/inventory/bulk', [{ id: y.id, leftover: 51 }]);

      const sheet = new InventorySheet(page);
      await sheet.open(world.branch.name, today(), [trays.name]);
      await sheet.expectNumber(trays.name, 'Prev. Leftover', 51);
      await sheet.expectNumber(trays.name, 'Leftover', 51); // carried
      await expect(sheet.uncountedMarker(trays.name)).not.toHaveAttribute('title', /Not counted yet/);

      // Uncounted equipment is settled: it does not hold up the cash day.
      let day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
      expect(day.breakdown.find((r) => r.product.id === trays.id)!.settled).toBe(true);

      // Two trays gone: missing, and charged like a sale.
      await sheet.enter(trays.name, { leftover: 49 });
      await expect(sheet.cell(trays.name, 'Sold')).toHaveText('2 missing');
      day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
      const row = day.breakdown.find((r) => r.product.id === trays.id)!;
      expect(row.sold).toBe(2);
      expect(row.sales).toBe(2 * PRICE);
    } finally {
      await retire(api, trays.id);
    }
  });

  test('is never offered on an order, and the API refuses one', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const trays = await equipment(api, world);
    try {
      const orders = new ProductionOrdersPage(page);
      await orders.open(world.branch, today());
      await page.getByRole('button', { name: 'New Order' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('cell', { name: world.products[0].name, exact: true })).toBeVisible();
      await expect(dialog.getByRole('cell', { name: trays.name, exact: true })).toHaveCount(0);

      const res = await api.raw('POST', '/production-orders', {
        branchId: world.branch.id,
        date: today(),
        items: [{ productId: trays.id, yield: 3 }],
      });
      expect(res.status()).toBe(400);
      expect(await res.text()).toContain('equipment');
    } finally {
      await retire(api, trays.id);
    }
  });

  test('the product form marks a Miscellaneous item as equipment', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 0 });
    const name = `${world.branch.name} Freezer`;
    const products = new ProductsPage(page);
    await products.open();
    await products.openCreate();
    await products.fill({ name, type: 'BREAD', price: '20000' });
    await expect(products.dialog.getByLabel('Equipment')).toHaveCount(0); // Miscellaneous only
    await products.fill({ type: 'MISCELLANEOUS' });
    await products.dialog.getByLabel('Equipment').check();
    expect((await products.save()).status).toBe(201);

    await products.search(name);
    await expect(products.row(name).getByText('Equipment', { exact: true })).toBeVisible();
    const list = await api.get<Array<{ id: number; name: string; isEquipment: boolean }>>('/products');
    const created = list.find((p) => p.name === name)!;
    expect(created.isEquipment).toBe(true);
    await retire(api, created.id);
  });
});
