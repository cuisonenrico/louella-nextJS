import { expect, type Locator, type Page } from '@playwright/test';
import { today } from '../fixtures/dates';

const FIGURE_LABEL = {
  sales: /^Sales$/,
  expenses: /^− Expenses$/,
  vale: /^− Vale$/,
  expected: /^= Expected cash$/,
} as const;

/**
 * The "Cash" panel for one branch and day (src/components/branch-cash/*): expenses, vale, the
 * Sales − Expenses − Vale = Expected figures, Counted cash, and the verify controls.
 *
 * The same panel appears in two places: under the sheet on /inventory/details (where a manager
 * records the drawer) and inside the side sheet on /branch-cash (where an admin verifies).
 * `scope` is whichever container holds it.
 *
 * Both entry forms share labels (Amount, Note), so each is found by its own submit button.
 * The counted cash saves on blur/Enter; it is disabled once the day is verified.
 */
export class BranchCashDay {
  constructor(
    private readonly page: Page,
    private readonly scope: Locator,
  ) {}

  /** Manager's entry point: pick the branch on /inventory/details (today) and get the panel. */
  static async onSheet(page: Page, branch: { id: number; name: string }): Promise<BranchCashDay> {
    await page.goto('/inventory/details');
    const loaded = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes('/api/v1/branch-cash/day?') &&
        r.url().includes(`branchId=${branch.id}`) &&
        r.url().includes(`date=${today()}`),
    );
    await page.getByRole('radio', { name: branch.name, exact: true }).click();
    expect((await loaded).ok()).toBe(true);
    const scope = page.locator('div.shadow-none').filter({ has: page.getByText('Cash', { exact: true }) });
    const day = new BranchCashDay(page, scope);
    await expect(day.countedCash).toBeVisible();
    return day;
  }

  get countedCash(): Locator {
    return this.scope.getByLabel('Counted cash');
  }

  figure(which: keyof typeof FIGURE_LABEL): Locator {
    return this.scope
      .locator('dt')
      .filter({ hasText: FIGURE_LABEL[which] })
      .locator('xpath=following-sibling::dd[1]');
  }

  get verifyButton(): Locator {
    return this.scope.getByRole('button', { name: 'Verify day' });
  }

  get reopenButton(): Locator {
    return this.scope.getByRole('button', { name: 'Reopen' });
  }

  get uncountedMessage(): Locator {
    return this.scope.getByText(/no leftover count yet/);
  }

  get drift(): Locator {
    return this.scope.getByText(/changed since verification/);
  }

  get verifiedNote(): Locator {
    return this.scope.getByText(/^Verified by/);
  }

  async addExpense(categoryName: string, amount: number, note?: string) {
    await this.addLine('Add expense', 'Category', categoryName, amount, note, '/api/v1/branch-cash/expenses');
  }

  async addVale(employeeName: string, amount: number, note?: string) {
    await this.addLine('Add vale', 'Employee', employeeName, amount, note, '/api/v1/branch-cash/vale');
  }

  async setCountedCash(amount: number) {
    const saved = this.page.waitForResponse(
      (r) => r.request().method() === 'PUT' && r.url().includes('/api/v1/branch-cash/day/actual-cash'),
    );
    await this.countedCash.fill(String(amount));
    await this.countedCash.press('Enter');
    expect((await saved).ok()).toBe(true);
  }

  async verify() {
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/v1/branch-cash/day/verify'),
    );
    await this.verifyButton.click();
    expect((await done).ok()).toBe(true);
    await expect(this.verifiedNote).toBeVisible();
  }

  async reopen() {
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/api/v1/branch-cash/day/reopen'),
    );
    await this.reopenButton.click();
    expect((await done).ok()).toBe(true);
    await expect(this.verifiedNote).toHaveCount(0);
  }

  private async addLine(
    submitLabel: string,
    pickLabel: string,
    option: string,
    amount: number,
    note: string | undefined,
    path: string,
  ) {
    // `has` is matched relative to each form, so it must not be rooted at `scope`.
    const form = this.scope.locator('form').filter({ has: this.page.getByRole('button', { name: submitLabel, exact: true }) });
    await form.getByLabel(pickLabel).selectOption({ label: option });
    await form.getByLabel('Amount').fill(String(amount));
    if (note) await form.getByLabel('Note').fill(note);
    const created = this.page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(path));
    await form.getByRole('button', { name: submitLabel, exact: true }).click();
    expect((await created).ok()).toBe(true);
  }
}
