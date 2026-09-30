import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /materials — src/app/(app)/materials/page.tsx. Same shape as /products: a searchable table
 * (Name, Unit, Price / Unit, Reorder Level, Actions), one create/edit dialog (Name, Unit, Price per
 * Unit (₱), Reorder Level; an edit adds a "Price History" tab), and a delete confirmation.
 */
export class MaterialsPage {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async open() {
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/v1\/materials$/.test(r.url()),
    );
    await this.page.goto('/materials');
    expect((await loaded).ok()).toBe(true);
    await expect(this.page.getByRole('button', { name: 'Add Material' })).toBeVisible();
  }

  async search(text: string) {
    await this.page.getByPlaceholder('Search materials…').fill(text);
  }

  row(name: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
  }

  async openCreate() {
    await this.page.getByRole('button', { name: 'Add Material' }).click();
    await expect(this.dialog.getByRole('heading', { name: 'New Material' })).toBeVisible();
  }

  async openEdit(name: string) {
    await this.row(name).locator('button:has(svg.lucide-pencil)').click();
    await expect(this.dialog.getByRole('heading', { name: 'Edit Material' })).toBeVisible();
  }

  async fill(values: { name?: string; unit?: string; price?: string; reorder?: string }) {
    const d = this.dialog;
    if (values.name !== undefined) await d.getByLabel('Name', { exact: true }).fill(values.name);
    if (values.unit) {
      await d.getByLabel('Unit', { exact: true }).click();
      await this.page.getByRole('option', { name: values.unit, exact: true }).click();
    }
    if (values.price !== undefined) await d.getByLabel('Price per Unit (₱)').fill(values.price);
    if (values.reorder !== undefined) await d.getByLabel('Reorder Level').fill(values.reorder);
  }

  async save(): Promise<{ status: number }> {
    const done = this.page.waitForResponse(
      (r) => ['POST', 'PATCH'].includes(r.request().method()) && /\/api\/v1\/materials(\/\d+)?$/.test(r.url()),
    );
    await this.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    return { status: (await done).status() };
  }

  get formError(): Locator {
    return this.dialog.getByRole('alert');
  }

  async openPriceHistory() {
    await this.dialog.getByRole('tab', { name: 'Price History' }).click();
  }

  priceHistoryRows(): Locator {
    return this.dialog.getByRole('row').filter({ hasText: /₱/ });
  }

  async remove(name: string) {
    await this.row(name).locator('button:has(svg.lucide-trash-2)').click();
    const confirm = this.page.getByRole('alertdialog');
    await expect(confirm.getByText('Delete Material')).toBeVisible();
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && /\/api\/v1\/materials\/\d+$/.test(r.url()),
    );
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    expect((await done).ok()).toBe(true);
  }
}
