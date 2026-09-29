import { test, expect } from '../fixtures/test';
import { today, yesterday } from '../fixtures/dates';
import { buildWorld, managerPage } from '../fixtures/world';
import { InventorySheet } from '../pages/inventory-sheet.page';
import type { SalesDay } from '../support/types';

// Driven as admin: see the note in pages/inventory-sheet.page.ts about scoped managers.
test.describe('inventory sheet @stress', () => {
  test("editing yesterday's leftover carries into today's opening", async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const product = world.products[0].name;
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, yesterday(), [product]);
    await sheet.enter(product, { delivery: 30, leftover: 5 });
    await sheet.open(world.branch.name, today(), [product]);
    await sheet.expectNumber(product, 'Prev. Leftover', 5);

    await sheet.open(world.branch.name, yesterday(), [product]);
    await sheet.enter(product, { leftover: 9 });
    await sheet.open(world.branch.name, today(), [product]);
    await sheet.expectNumber(product, 'Prev. Leftover', 9);
  });

  test('an uncounted row is flagged and sells nothing until the leftover is entered', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today(), [p.name]);
    await sheet.enter(p.name, { delivery: 20 }); // no leftover entered
    await expect(sheet.uncountedMarker(p.name)).toHaveAttribute('title', /Not counted yet/);
    await sheet.expectNumber(p.name, 'Sold', 0);

    // Same answer from the API: not settled, nothing sold.
    const day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
    const row = day.breakdown.find((r) => r.product.id === p.id)!;
    expect(row.settled).toBe(false);
    expect(row.sold).toBe(0);

    // Counting the leftover clears the flag and books the sale.
    await sheet.enter(p.name, { leftover: 2 });
    await expect(sheet.uncountedMarker(p.name)).not.toHaveAttribute('title', /Not counted yet/);
    await sheet.expectNumber(p.name, 'Sold', 20 - 2);
  });

  test('a PULL_IN adjustment moves sold', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const sheet = new InventorySheet(page);
    const delivery = 10;
    const leftover = 2;
    const pullIn = 4;

    await sheet.open(world.branch.name, today(), [p.name]);
    await sheet.enter(p.name, { delivery, leftover });
    await sheet.expectNumber(p.name, 'Sold', delivery - leftover);

    await sheet.addPullIn(p.name, pullIn);
    // sold = quantity + delivery + Σadj − leftover − reject
    await sheet.expectNumber(p.name, 'Sold', delivery + pullIn - leftover);

    const day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
    expect(day.breakdown.find((r) => r.product.id === p.id)!.sold).toBe(delivery + pullIn - leftover);
  });

  test('Initialize creates a row for every active product', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 2 });
    const names = world.products.map((p) => p.name);
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today(), names);
    for (const name of names) await sheet.expectNumber(name, 'Prev. Leftover', 0);

    const day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
    const rowIds = day.breakdown.map((r) => r.product.id);
    for (const p of world.products) expect(rowIds).toContain(p.id);
  });

  // Regression: a branch manager (scoped, no all-branches) used to get 400
  // "property branchId should not exist" on GET /inventory/branch/:id/date and GET /inventory/date,
  // because BranchGuard pins branchId into req.query and the app's forbidNonWhitelisted
  // ValidationPipe rejected it on DTOs without that field (fixed by ScopedValidationPipe).
  test('a branch manager loads their own daily sheet and can save it', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const product = world.products[0].name;
    const page = await managerPage(browser, world);
    const failed: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/v1/inventory') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    const sheet = new InventorySheet(page);
    await sheet.open(world.branch.name, today(), [product]);
    // The write path too: the manager's own PATCH /inventory/bulk goes through the same guard.
    await sheet.enter(product, { delivery: 12, leftover: 2 });
    await sheet.expectNumber(product, 'Sold', 12 - 2);

    expect(failed).toEqual([]);
    await page.context().close();
  });
});
