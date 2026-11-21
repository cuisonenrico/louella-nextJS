import { test, expect } from '../fixtures/test';
import { addDays, today, yesterday } from '../fixtures/dates';
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

  test('sold is green when positive and red when negative', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const sheet = new InventorySheet(page);
    const sold = sheet.cell(p.name, 'Sold').getByText(/^-?\d+$/);

    await sheet.open(world.branch.name, today(), [p.name]);
    await sheet.enter(p.name, { delivery: 5, leftover: 2 });
    await sheet.expectNumber(p.name, 'Sold', 3);
    await expect(sold).toHaveClass(/bg-green-500/);

    // More leftover than stock: the server would refuse it, but while it is typed the sheet shows −3 in red.
    await sheet.fill(p.name, { leftover: 8 });
    await sheet.expectNumber(p.name, 'Sold', -3);
    await expect(sold).toHaveClass(/bg-red-500/);
    await expect(sold).not.toHaveClass(/bg-green-500/);
  });

  test('each category ends with its sold and revenue subtotal', async ({ api, page }) => {
    // Two BREAD products at ₱10 and ₱15. The branch is new, so every other product's row sells nothing.
    const world = await buildWorld(api, { products: 2 });
    const [a, b] = world.products;
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today(), [a.name, b.name]);
    await sheet.fill(a.name, { delivery: 10, leftover: 2 });
    await sheet.enter(b.name, { delivery: 6, leftover: 1 });

    const sold = 8 + 5;
    const revenue = 8 * a.price + 5 * b.price;
    const subtotal = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Bread subtotal', exact: true }) });
    await expect(subtotal.getByRole('cell').nth(2)).toHaveText(String(sold));
    await expect(subtotal.getByRole('cell').nth(3)).toHaveText(`₱${revenue.toLocaleString()}`);

    const day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
    const mine = day.breakdown.filter((r) => r.product.id === a.id || r.product.id === b.id);
    expect(mine.reduce((n, r) => n + r.sold, 0)).toBe(sold);
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

  test('admin sees the stock value and the revenue figures', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today(), [p.name]);
    await sheet.enter(p.name, { delivery: 10, leftover: 2 });
    // Stock value = on hand × that day's price; a new branch opens at 0, so on hand = delivery.
    await expect(sheet.cell(p.name, 'Stock ₱')).toHaveText(`₱${(10 * p.price).toLocaleString()}`);
    await expect(page.getByRole('columnheader', { name: 'Revenue', exact: true })).toBeVisible();
    // The summary under the sheet: 8 sold at the day's price.
    const summary = page.getByRole('region', { name: 'Day summary' });
    await expect(summary.getByRole('group', { name: 'Sales' })).toContainText(`₱${(8 * p.price).toLocaleString()}`);
  });

  test('a branch manager sees the stock value but no revenue', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const page = await managerPage(browser, world);
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today(), [p.name]);
    await sheet.enter(p.name, { delivery: 10, leftover: 2 });
    await expect(sheet.cell(p.name, 'Stock ₱')).toHaveText(`₱${(10 * p.price).toLocaleString()}`);
    await sheet.expectNumber(p.name, 'Sold', 8);
    await expect(page.getByRole('columnheader', { name: 'Revenue', exact: true })).toHaveCount(0);
    const summary = page.getByRole('region', { name: 'Day summary' });
    await expect(summary.getByRole('group', { name: 'Pieces sold' })).toContainText('8');
    await expect(page.getByText(/Revenue/)).toHaveCount(0);
    // No peso figure in the summary either.
    await expect(summary.getByRole('group', { name: 'Sales' })).toHaveCount(0);
    await expect(summary).not.toContainText('₱');
    await page.context().close();
  });

  test('wide screens get no phone tab bar', async ({ page }) => {
    await page.goto('/inventory/details');
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Phone navigation' })).toBeHidden();
  });
});

// The browser runs in Asia/Manila (playwright.config.ts). "This Month" used to build
// the 1st at local midnight and read it back through toISOString(), which in Manila is
// 16:00 UTC the day before: the range opened on the last day of the previous month.
test.describe('inventory sheet range shortcuts', () => {
  test('"This Month" starts on the 1st and "Last 7d" covers seven days, both ending today', async ({ page }) => {
    await page.goto('/inventory/details');
    await expect(page.locator('input[type="date"]').first()).toBeVisible();

    await page.locator('button:has(svg.lucide-calendar-range)').click();
    const [from, to] = [page.locator('input[type="date"]').nth(0), page.locator('input[type="date"]').nth(1)];

    await page.getByRole('button', { name: 'This Month', exact: true }).click();
    await expect(from).toHaveValue(`${today().slice(0, 7)}-01`);
    await expect(to).toHaveValue(today());

    await page.getByRole('button', { name: 'Last 7d', exact: true }).click();
    await expect(from).toHaveValue(addDays(today(), -6));
    await expect(to).toHaveValue(today());
  });
});

// The branch picker was a row of small chips under the dates, and the chosen one was a
// faint grey that was easy to miss. It now leads the page as tabs, the chosen one filled.
test.describe('inventory sheet branch tabs', () => {
  test('the branch tabs lead the page and the chosen one stands out', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 0 });
    await page.goto('/inventory/details');
    const dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();

    const tabs = page.getByRole('group', { name: 'Branch' });
    const all = tabs.getByRole('radio', { name: 'All', exact: true });
    const mine = tabs.getByRole('radio', { name: world.branch.name, exact: true });

    // Above the date controls.
    const [tabsBox, dateBox] = [await tabs.boundingBox(), await dateInput.boundingBox()];
    expect(tabsBox!.y).toBeLessThan(dateBox!.y);

    // The page opens on "All", and it looks chosen (it never did: an empty value read as none).
    await expect(all).toHaveAttribute('aria-checked', 'true');

    const fill = (tab: typeof all) => tab.evaluate((el) => getComputedStyle(el).backgroundColor);
    const unselected = await fill(mine);
    expect(await fill(all)).not.toBe(unselected);

    await mine.click();
    await expect(mine).toHaveAttribute('aria-checked', 'true');
    await expect(all).toHaveAttribute('aria-checked', 'false');
    // Filled in the brand colour with white text, unlike the tabs not chosen.
    await expect.poll(() => fill(mine)).not.toBe(unselected);
    expect(await mine.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    expect(await fill(all)).toBe(unselected);
  });
});

// The Day Summary was a collapsed panel above the sheet with totals only. It now sits
// under the table, open, and reads the day back: sales, how much of the stock sold,
// rejects and leftover, what still needs someone, and the best and slowest products.
test.describe('inventory sheet day summary', () => {
  test('the summary under the sheet reads the day back and flags what needs attention', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 2 });
    const [good, bad] = world.products;
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today(), [good.name, bad.name]);
    // good: 10 delivered, 2 left, 1 rejected → 7 sold. bad: 4 delivered, 3 left → 1 sold.
    await sheet.fill(good.name, { delivery: 10, leftover: 2, reject: 1 });
    await sheet.fill(bad.name, { delivery: 4, leftover: 3 });
    await sheet.save();

    const summary = page.getByRole('region', { name: 'Day summary' });
    await expect(summary).toBeVisible();
    // Below the table, not above it.
    expect((await summary.boundingBox())!.y).toBeGreaterThan((await sheet.row(bad.name).boundingBox())!.y);

    const tile = (name: string) => summary.getByRole('group', { name, exact: true });
    await expect(tile('Sales')).toContainText(`₱${(7 * good.price + bad.price).toLocaleString()}`);
    await expect(tile('Pieces sold')).toContainText('8');
    // 8 sold of 8 + 1 rejected + 5 left = 14.
    await expect(tile('Sold of stock')).toContainText(`${Math.round((8 / 14) * 100)}%`);
    await expect(tile('Rejects')).toContainText('1 pc');
    await expect(tile('Rejects')).toContainText(`₱${good.price.toLocaleString()} thrown out`);
    await expect(tile('Leftover')).toContainText('5 pcs');

    await expect(summary.getByRole('region', { name: 'Best sellers' }).getByRole('listitem').first()).toContainText(good.name);
    await expect(summary.getByRole('region', { name: 'Slow movers' })).toContainText(bad.name);
    await expect(summary.getByRole('region', { name: 'Slow movers' })).not.toContainText(good.name);

    // Both were counted, so neither is listed as not counted.
    const notCounted = summary.getByRole('group', { name: 'Not counted yet' });
    if (await notCounted.count()) {
      await expect(notCounted).not.toContainText(good.name);
      await expect(notCounted).not.toContainText(bad.name);
    }

    // Typing updates the summary before saving, and a count over the stock is flagged
    // (the server would refuse it): 6 left of 4 is −2 sold.
    await sheet.fill(bad.name, { leftover: 6 });
    await expect(summary.getByText('Includes unsaved changes')).toBeVisible();
    await expect(tile('Pieces sold')).toContainText('5');
    await expect(summary.getByRole('group', { name: 'Check these counts' })).toContainText(`${bad.name}: -2 sold`);
  });
});
