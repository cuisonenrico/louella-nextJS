import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { test, expect } from '../fixtures/test';
import type { Api } from '../fixtures/api';
import { today, yesterday } from '../fixtures/dates';
import { buildWorld, managerPage, type World } from '../fixtures/world';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sheetName = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(8, 10)}`;

/** A counted day for one product: delivery in, leftover counted. */
async function countedDay(api: Api, world: World, productId: number, date: string, delivery: number, leftover: number) {
  const [row] = await api.post<Array<{ id: number }>>('/inventory/bulk', [
    { branchId: world.branch.id, productId, date, quantity: 0, delivery, reject: 0 },
  ]);
  await api.patch('/inventory/bulk', [{ id: row.id, leftover }]);
}

/** The 1-based row whose column A is `label`. */
function rowOf(ws: XLSX.WorkSheet, label: string): number {
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v === label) return r + 1;
  }
  throw new Error(`no row "${label}" on the sheet`);
}

test.describe('inventory XLSX export', () => {
  test('a sheet per day at current prices, then a summary', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    await countedDay(api, world, p.id, yesterday(), 30, 5); // sold 25
    await countedDay(api, world, p.id, today(), 10, 3); // opening 5 → sold 12
    // A raise today: yesterday's sheet must still use it, because the export follows current prices.
    const price = p.price + 7;
    await api.patch(`/products/${p.id}`, { price });

    await page.goto('/inventory/details');
    await page.getByRole('button', { name: 'Export XLSX' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export inventory' });
    await dialog.getByRole('combobox', { name: 'Branch' }).click();
    await page.getByRole('option', { name: world.branch.name, exact: true }).click();
    await dialog.getByLabel('From').fill(yesterday());
    await dialog.getByLabel('To').fill(today());
    await expect(dialog.getByText('2 day sheets + Summary')).toBeVisible();

    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download XLSX' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const wb = XLSX.read(readFileSync((await download.path())!), { type: 'buffer' });

    expect(wb.SheetNames).toEqual([sheetName(yesterday()), sheetName(today()), 'Summary']);

    const y = wb.Sheets[sheetName(yesterday())];
    const r = rowOf(y, p.name);
    expect(y[`B${r}`].v).toBe(price);
    expect(y[`I${r}`].v).toBe(25); // PCS SOLD
    expect(y[`M${r}`].v).toBe(25 * price); // SALES at today's price

    const t = wb.Sheets[sheetName(today())];
    expect(t[`J${rowOf(t, p.name)}`].v).toBe(5); // yesterday's leftover opens today

    const sum = wb.Sheets.Summary;
    const s = rowOf(sum, p.name);
    expect(sum[`G${s}`].v).toBe(25 + 12);
    expect(sum[`H${s}`].v).toBe((25 + 12) * price);
    expect(sum[`I${s}`].v).toBe(3); // leftover at the end of the range
    await expect(dialog).toBeHidden();
  });

  test('a branch manager without the revenue permission gets no export', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const page = await managerPage(browser, world);
    await page.goto('/inventory/details');
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export XLSX' })).toHaveCount(0);
    await page.context().close();
  });
});
