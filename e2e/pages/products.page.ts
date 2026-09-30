import { expect, type Locator, type Page } from '@playwright/test';

export type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';

/**
 * /products — src/app/(app)/products/page.tsx.
 *
 * A table (Name, Type, Price, Launch Date, Status, Actions) with a client-side search box; the
 * icon-only Edit/Delete buttons have no accessible name, so they are found by icon (pencil / trash-2).
 * "Add Product" and Edit open one dialog (Name, Type, Price (₱), Launch Date, Status; an edit adds a
 * "Price History" tab). Delete asks for confirmation. The list holds every test's products, so
 * search() narrows it to one.
 */
export class ProductsPage {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async open() {
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/v1\/products(\?.*)?$/.test(r.url()),
    );
    await this.page.goto('/products');
    expect((await loaded).ok()).toBe(true);
    await expect(this.page.getByRole('button', { name: 'Add Product' })).toBeVisible();
  }

  async search(text: string) {
    await this.page.getByPlaceholder('Search products…').fill(text);
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
  }

  async openCreate() {
    await this.page.getByRole('button', { name: 'Add Product' }).click();
    await expect(this.dialog.getByRole('heading', { name: 'New Product' })).toBeVisible();
  }

  async openEdit(name: string) {
    await this.row(name).locator('button:has(svg.lucide-pencil)').click();
    await expect(this.dialog.getByRole('heading', { name: 'Edit Product' })).toBeVisible();
  }

  async fill(values: { name?: string; type?: ProductType; price?: string; launch?: string; status?: 'Active' | 'Inactive' }) {
    const d = this.dialog;
    if (values.name !== undefined) await d.getByLabel('Name', { exact: true }).fill(values.name);
    if (values.type) {
      await d.getByLabel('Type', { exact: true }).click();
      await this.page.getByRole('option', { name: values.type, exact: true }).click();
    }
    if (values.price !== undefined) await d.getByLabel('Price (₱)').fill(values.price);
    if (values.launch !== undefined) await d.getByLabel('Launch Date').fill(values.launch);
    if (values.status) {
      await d.getByLabel('Status', { exact: true }).click();
      await this.page.getByRole('option', { name: values.status, exact: true }).click();
    }
  }

  get saveButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Save', exact: true });
  }

  /** Click Save and wait for the create/update response. */
  async save(): Promise<{ status: number }> {
    const done = this.page.waitForResponse(
      (r) => ['POST', 'PATCH'].includes(r.request().method()) && /\/api\/v1\/products(\/\d+)?$/.test(r.url()),
    );
    await this.saveButton.click();
    return { status: (await done).status() };
  }

  get formError(): Locator {
    return this.dialog.getByRole('alert');
  }

  async openPriceHistory() {
    await this.dialog.getByRole('tab', { name: 'Price History' }).click();
  }

  /** The Price History tab's rows as [date, price] text pairs. */
  priceHistoryRows(): Locator {
    return this.dialog.getByRole('row').filter({ hasText: /₱/ });
  }

  async remove(name: string) {
    await this.row(name).locator('button:has(svg.lucide-trash-2)').click();
    const confirm = this.page.getByRole('alertdialog');
    await expect(confirm.getByText('Delete Product')).toBeVisible();
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && /\/api\/v1\/products\/\d+$/.test(r.url()),
    );
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    expect((await done).ok()).toBe(true);
  }
}
