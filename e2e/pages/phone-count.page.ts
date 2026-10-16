import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /inventory/details on a phone — the count list + product sheet
 * (src/app/(app)/inventory/components/phone/).
 *
 *  - One branch, one day. A branch-scoped manager has no branch picker; the day bar is ‹ Today ›.
 *  - Rows are buttons named by the product; each figure carries `data-field`
 *    (onHand, stockValue, leftover, reject, sold).
 *  - Tapping a row opens a bottom sheet (a dialog named by the product) with steppers labelled
 *    "Leftover", "Reject" and, after "Different count?", "Delivery received".
 *  - "Save & next" queues the row on the phone and sends it; the sync chip (role=status) says
 *    "● Saved", "● N waiting for signal" or "N couldn't save".
 */
export type PhoneField = 'Leftover' | 'Reject' | 'Delivery received';
export type RowField = 'onHand' | 'stockValue' | 'leftover' | 'reject' | 'sold';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class PhoneCount {
  constructor(private readonly page: Page) {}

  /** Load the sheet fresh and wait for today's rows for the manager's branch. */
  async open() {
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/v1\/inventory\/branch\/\d+\/date\?/.test(r.url()),
    );
    await this.page.goto('/inventory/details');
    expect((await loaded).ok()).toBe(true);
    await expect(this.initializeButton().or(this.page.getByText(/of \d+ counted/)).first()).toBeVisible();
  }

  initializeButton(): Locator {
    return this.page.getByRole('button', { name: /^Initialize \d+ rows?$/ });
  }

  async initialize() {
    const created = this.page.waitForResponse(
      (r) => r.url().includes('/api/v1/inventory/bulk') && r.request().method() === 'POST',
    );
    await this.initializeButton().click();
    expect((await created).ok()).toBe(true);
    await expect(this.initializeButton()).toHaveCount(0);
  }

  row(product: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${escape(product)}(\\s|$)`) });
  }

  rowField(product: string, field: RowField): Locator {
    return this.row(product).locator(`[data-field="${field}"]`);
  }

  sheet(product?: string): Locator {
    return product ? this.page.getByRole('dialog', { name: product }) : this.page.getByRole('dialog');
  }

  async openProduct(product: string): Promise<Locator> {
    await this.row(product).click();
    const sheet = this.sheet(product);
    await expect(sheet).toBeVisible();
    return sheet;
  }

  async set(field: PhoneField, value: number) {
    await this.sheet().getByRole('textbox', { name: field, exact: true }).fill(String(value));
  }

  async differentCount() {
    await this.sheet().getByRole('button', { name: 'Different count?' }).click();
  }

  async saveAndNext() {
    await this.sheet().getByRole('button', { name: /Save & next/ }).click();
  }

  /**
   * The sync chip. A CSS locator, not getByRole: while the product sheet is open Radix marks the
   * page behind it aria-hidden, which hides the chip from role queries though it is still on screen.
   */
  sync(): Locator {
    return this.page.locator('[role="status"]').filter({ hasText: /Saved|waiting for signal|couldn't save/ });
  }

  async expectSaved() {
    await expect(this.sync()).toContainText('● Saved');
  }
}
