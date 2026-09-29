import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /production-orders (also served at /production/orders) —
 * src/app/(app)/production-orders/page.tsx.
 *
 *  - Toolbar: a native <input type="date">, and a Radix Select (combobox) for the branch,
 *    enabled for admin only. "New Order" opens a dialog listing every active product with a
 *    Yield input; "Create" saves a DRAFT.
 *  - Each order is a card titled "PO #<id>" with a status badge (Draft/Finalized/Cancelled).
 *    Its icon-only buttons have no accessible name (tooltip only), so they are found by icon:
 *    check = finalize, x = cancel. Finalize and cancel each ask for confirmation.
 *  - Cancel sets status CANCELLED — the order stays listed.
 *
 * Like the inventory sheet, the page keeps the previous query's data on screen while a new one
 * loads, so open() loads fresh and waits for the exact response.
 */
export class ProductionOrdersPage {
  constructor(private readonly page: Page) {}

  async open(branch: { id: number; name: string }, date: string) {
    await this.page.goto('/production-orders');
    const dateInput = this.page.locator('input[type="date"]').first();
    const branchSelect = this.page.getByRole('combobox').first();
    await expect(dateInput).toBeVisible();
    await expect(branchSelect).toBeVisible();

    const needBranch = !(await branchSelect.innerText()).includes(branch.name);
    const needDate = (await dateInput.inputValue()) !== date;

    // Register before acting: the request for the FINAL branch+day is the one we wait for.
    const loaded =
      needBranch || needDate
        ? this.page.waitForResponse(
            (r) =>
              r.request().method() === 'GET' &&
              r.url().includes('/api/v1/production-orders/by-date') &&
              r.url().includes(`date=${date}`) &&
              r.url().includes(`branchId=${branch.id}`),
          )
        : undefined;

    if (needBranch) {
      await branchSelect.click();
      await this.page.getByRole('option', { name: branch.name, exact: true }).click();
    }
    if (needDate) await dateInput.fill(date);
    if (loaded) expect((await loaded).ok()).toBe(true);
    await expect(this.page.getByRole('button', { name: 'New Order' })).toBeEnabled();
  }

  card(id: number): Locator {
    return this.page.locator('div.shadow-sm').filter({ has: this.page.getByText(`PO #${id}`, { exact: true }) });
  }

  status(id: number): Locator {
    return this.card(id).getByText(/^(Draft|Finalized|Cancelled)$/);
  }

  /** Create a DRAFT order for the branch/day currently open; returns its id. */
  async create(items: Array<{ productName: string; yield: number }>): Promise<number> {
    await this.page.getByRole('button', { name: 'New Order' }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New Production Order' })).toBeVisible();

    for (const { productName, yield: quantity } of items) {
      // `has` is matched relative to each row, so its locator must not be rooted at the dialog.
      const row = dialog.getByRole('row').filter({ has: this.page.getByRole('cell', { name: productName, exact: true }) });
      await row.locator('input').fill(String(quantity));
    }

    const created = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/v1\/production-orders$/.test(r.url()),
    );
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    const response = await created;
    expect(response.ok()).toBe(true);
    const { id } = (await response.json()) as { id: number };
    await expect(dialog).toHaveCount(0);
    await expect(this.card(id)).toBeVisible();
    return id;
  }

  async finalize(id: number) {
    await this.card(id).locator('button:has(svg.lucide-check)').click();
    const dialog = this.page.getByRole('alertdialog');
    await expect(dialog.getByText(`Finalize PO #${id}?`)).toBeVisible();
    const done = this.patched(id);
    await dialog.getByRole('button', { name: 'Finalize', exact: true }).click();
    expect((await done).ok()).toBe(true);
    await expect(this.status(id)).toHaveText('Finalized');
  }

  async cancel(id: number) {
    await this.card(id).locator('button:has(svg.lucide-x)').click();
    const dialog = this.page.getByRole('alertdialog');
    await expect(dialog.getByText(`Cancel PO #${id}?`)).toBeVisible();
    const done = this.patched(id);
    await dialog.getByRole('button', { name: 'Cancel Order', exact: true }).click();
    expect((await done).ok()).toBe(true);
    await expect(this.status(id)).toHaveText('Cancelled');
  }

  private patched(id: number) {
    return this.page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/v1/production-orders/${id}`),
    );
  }
}
