import dayjs from 'dayjs';
import { test, expect } from '../fixtures/test';
import { today } from '../fixtures/dates';
import { uniqueName } from '../fixtures/names';
import { buildWorld } from '../fixtures/world';
import { MaterialsPage } from '../pages/materials.page';

interface Material {
  id: number;
  name: string;
  unit: string;
  pricePerUnit: number;
  reorderLevel: number;
}
interface PriceRow {
  pricePerUnit: number;
  effectiveAt: string;
}

const fmt = (isoDay: string) => dayjs(isoDay).format('MMM D, YYYY');
const list = (api: { get<T>(p: string): Promise<T> }) => api.get<Material[]>('/materials');

/** Materials (src/app/(app)/materials): the raw-ingredient catalog that recipes and stock cards hang off. */
test.describe('catalog: materials @stress', () => {
  test('create: the row appears with its unit, price and reorder level', async ({ api, page }) => {
    const name = uniqueName('Flour');
    const materials = new MaterialsPage(page);
    await materials.open();
    await materials.openCreate();
    await materials.fill({ name, unit: 'KG', price: '42.5', reorder: '10' });
    expect((await materials.save()).status).toBe(201);

    await materials.search(name);
    const row = materials.row(name);
    await expect(row).toBeVisible();
    await expect(row.getByText('KG', { exact: true })).toBeVisible();
    await expect(row.getByText('₱42.50')).toBeVisible();

    const stored = (await list(api)).find((m) => m.name === name)!;
    expect(stored).toMatchObject({ unit: 'KG', pricePerUnit: 42.5, reorderLevel: 10 });
  });

  test('a name is required and a price cannot be negative — nothing is created', async ({ api, page }) => {
    const materials = new MaterialsPage(page);
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/api\/v1\/materials$/.test(r.url())) posts.push(r.url());
    });
    await materials.open();
    await materials.openCreate();

    await materials.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(materials.formError).toContainText(/name is required/i);
    expect(posts).toEqual([]);

    const name = uniqueName('Negative');
    await materials.fill({ name, price: '-1' });
    await materials.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(materials.formError).toContainText(/price/i);
    expect((await list(api)).some((m) => m.name === name)).toBe(false);
  });

  test('a price change is recorded from today; a name-only edit records nothing', async ({ api, page }) => {
    const name = uniqueName('Sugar');
    const made = await api.post<Material>('/materials', { name, unit: 'KG', pricePerUnit: 50 });
    const before = (await api.get<PriceRow[]>(`/materials/${made.id}/price-history`)).length;
    const materials = new MaterialsPage(page);
    await materials.open();
    await materials.search(name);

    await materials.openEdit(name);
    await materials.fill({ name: `${name} v2` });
    expect((await materials.save()).status).toBe(200);
    expect(await api.get<PriceRow[]>(`/materials/${made.id}/price-history`)).toHaveLength(before);

    await materials.search(`${name} v2`);
    await materials.openEdit(`${name} v2`);
    await materials.fill({ price: '55' });
    expect((await materials.save()).status).toBe(200);

    const history = await api.get<PriceRow[]>(`/materials/${made.id}/price-history`);
    expect(history).toHaveLength(before + 1);
    // Opening price and the change are both dated today, so their order is a tie: look the row up.
    const added = history.find((h) => h.pricePerUnit === 55)!;
    expect(added.effectiveAt.slice(0, 10)).toBe(today());
  });

  // BUG. Saving a material only invalidates ['materials']; the dialog's price-history query is left as it
  // was, so reopening Edit → Price History right after a price change still shows the old list (until the
  // query's staleTime lapses or the page reloads).
  test('the Price History tab shows a new price straight after it is saved', async ({ api, page }) => {
    test.fail(true, 'materials page: price-history query is not invalidated after a save');
    const name = uniqueName('Salt');
    await api.post<Material>('/materials', { name, unit: 'KG', pricePerUnit: 20 });
    const materials = new MaterialsPage(page);
    await materials.open();
    await materials.search(name);
    await materials.openEdit(name);
    await materials.openPriceHistory();
    await expect(materials.priceHistoryRows()).toHaveCount(1);
    await materials.dialog.getByRole('tab', { name: 'Details' }).click();
    await materials.fill({ price: '25' });
    expect((await materials.save()).status).toBe(200);

    await materials.openEdit(name);
    await materials.openPriceHistory();
    await expect(materials.priceHistoryRows().filter({ hasText: '₱25.00' })).toContainText(fmt(today()));
  });

  test('the unit of a material that a recipe uses cannot be changed', async ({ api }) => {
    const w = await buildWorld(api, { withRecipe: true });
    const res = await api.raw('PATCH', `/materials/${w.material!.id}`, { unit: 'KG' });
    expect(res.status()).toBe(409);
    expect((await list(api)).find((m) => m.id === w.material!.id)!.unit).toBe('G');
  });

  test('the unit of a material nothing uses can be changed', async ({ api }) => {
    const made = await api.post<Material>('/materials', { name: uniqueName('Loose'), unit: 'G', pricePerUnit: 1 });
    const res = await api.raw('PATCH', `/materials/${made.id}`, { unit: 'KG' });
    expect(res.status()).toBe(200);
    expect((await list(api)).find((m) => m.id === made.id)!.unit).toBe('KG');
  });

  test('delete: gone from the list and the API', async ({ api, page }) => {
    const name = uniqueName('Doomed');
    const made = await api.post<Material>('/materials', { name, unit: 'KG', pricePerUnit: 5 });
    const materials = new MaterialsPage(page);
    await materials.open();
    await materials.search(name);
    await expect(materials.row(name)).toBeVisible();

    await materials.remove(name);
    await expect(materials.row(name)).toHaveCount(0);
    expect((await api.raw('GET', `/materials/${made.id}`)).status()).toBe(404);
  });
});
