import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /inventory/details — the daily sheet (src/app/(app)/inventory/details/page.tsx).
 *
 * What the code does, so the locators below make sense:
 *  - Branch is a radio group (ToggleGroup) starting on "All"; the date is a native
 *    <input type="date">. Clicking the branch that is already selected DESELECTS it.
 *  - Rows for a branch/day are created by the explicit "Initialize N rows" button
 *    (POST /inventory/bulk) — viewing does not write.
 *  - Only Delivery, Leftover and Reject are editable. Edits are STAGED, then saved
 *    with "Save Changes" (one PATCH /inventory/bulk).
 *  - Cells have no accessible names, so they are found by column position; open()
 *    checks the header order and fails loudly if the layout ever changes.
 *  - A leftover nobody has entered has title "Not counted yet — …" and sells nothing.
 *
 * Most specs drive it as ADMIN (the rules are role-independent). A scoped MANAGER loading and saving it
 * has its own regression test — it once failed with 400 "property branchId should not exist".
 */
export type SheetField = 'delivery' | 'leftover' | 'reject';

const COLUMNS = [
  'Product',
  'Prev. Leftover',
  'Delivery',
  'Adjustments',
  'Total Stock',
  'Leftover',
  'Reject',
  'Sold',
  'Revenue',
] as const;
export type SheetColumn = (typeof COLUMNS)[number];

const INPUT_COLUMNS: SheetColumn[] = ['Delivery', 'Leftover', 'Reject'];
const FIELD_COLUMN: Record<SheetField, SheetColumn> = { delivery: 'Delivery', leftover: 'Leftover', reject: 'Reject' };

export class InventorySheet {
  constructor(private readonly page: Page) {}

  /**
   * Select the branch and day, create missing rows, and wait until every named product has a row.
   *
   * Always loads the page fresh. The sheet keeps the PREVIOUS query's rows on screen while a new
   * one loads (keepPreviousData) and caches for 30 s — with "All" selected it even shows one
   * placeholder row per branch — so reading it mid-transition gives stale or duplicated rows.
   * A fresh page has an empty cache, and we wait for the exact response before deciding anything.
   */
  async open(branchName: string, date: string, productNames: string[]) {
    await this.page.goto('/inventory/details');

    const dateInput = this.page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();

    // Register before acting: the request for the FINAL branch+day is the one we wait for.
    const loaded = this.page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        /\/api\/v1\/inventory\/branch\/\d+\/date\?/.test(r.url()) &&
        r.url().includes(`date=${date}`),
    );
    await this.page.getByRole('radio', { name: branchName, exact: true }).click();
    if ((await dateInput.inputValue()) !== date) await dateInput.fill(date);
    expect((await loaded).ok()).toBe(true);

    // Either the rows are there (branch-only "Adjustments" column) or the Initialize bar is.
    const initialize = this.page.getByRole('button', { name: /^Initialize \d+ rows?$/ });
    const adjustments = this.page.getByRole('columnheader', { name: 'Adjustments', exact: true });
    await expect(initialize.or(adjustments).first()).toBeVisible();

    if (await initialize.isVisible()) {
      const created = this.page.waitForResponse(
        (r) => r.url().includes('/api/v1/inventory/bulk') && r.request().method() === 'POST',
      );
      await initialize.click();
      expect((await created).ok()).toBe(true);
    }

    await expect(adjustments).toBeVisible();
    for (const name of productNames) await expect(this.row(name)).toBeVisible();
    await this.assertLayout();
  }

  row(productName: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: productName, exact: true }) });
  }

  cell(productName: string, column: SheetColumn): Locator {
    return this.row(productName).getByRole('cell').nth(COLUMNS.indexOf(column));
  }

  /** Stage values in the row's inputs (not saved until save()). */
  async fill(productName: string, values: Partial<Record<SheetField, number>>) {
    for (const [field, value] of Object.entries(values) as Array<[SheetField, number]>) {
      await this.cell(productName, FIELD_COLUMN[field]).locator('input').fill(String(value));
    }
  }

  async save() {
    const saved = this.page.waitForResponse(
      (r) => r.url().includes('/api/v1/inventory/bulk') && r.request().method() === 'PATCH',
    );
    await this.page.getByRole('button', { name: 'Save Changes' }).click();
    expect((await saved).ok()).toBe(true);
    await expect(this.page.getByText(/unsaved change/)).toHaveCount(0);
  }

  async enter(productName: string, values: Partial<Record<SheetField, number>>) {
    await this.fill(productName, values);
    await this.save();
  }

  /** Assert a cell's number: inputs by value, everything else by text. */
  async expectNumber(productName: string, column: SheetColumn, expected: number) {
    const cell = this.cell(productName, column);
    if (INPUT_COLUMNS.includes(column)) await expect(cell.locator('input')).toHaveValue(String(expected));
    else await expect(cell).toHaveText(String(expected));
  }

  /** The leftover cell carries a "Not counted yet" title until a leftover is entered. */
  uncountedMarker(productName: string): Locator {
    return this.cell(productName, 'Leftover');
  }

  /** Add a PULL_IN (the dialog's default type) through the row's adjustments dialog. */
  async addPullIn(productName: string, value: number) {
    // The gear button has no accessible name (tooltip only) — it is the only button in the cell.
    await this.cell(productName, 'Adjustments').getByRole('button').click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByText(`Adjustments — ${productName}`)).toBeVisible();
    await dialog.getByLabel('Value', { exact: true }).fill(String(value));
    const created = this.page.waitForResponse(
      (r) => r.url().includes('/api/v1/inventory-adjustments') && r.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    expect((await created).ok()).toBe(true);
    await this.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }

  private async assertLayout() {
    const headers = (await this.page.locator('thead').first().getByRole('columnheader').allInnerTexts()).map((h) =>
      h.trim(),
    );
    expect(headers, 'sheet column order changed — update COLUMNS in inventory-sheet.page.ts').toEqual([...COLUMNS]);
  }
}
