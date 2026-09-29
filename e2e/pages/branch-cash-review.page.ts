import { expect, type Page } from '@playwright/test';
import { BranchCashDay } from './branch-cash-day.page';

/**
 * /branch-cash — the admin's review page (src/app/(app)/branch-cash/page.tsx): From/To dates
 * (default: the last 7 days), a native Branch filter, and a summary table. Clicking a row opens
 * a side sheet holding the same Cash panel, where an admin verifies or reopens the day.
 */
export class BranchCashReview {
  constructor(private readonly page: Page) {}

  /** Filter to the branch, open its row (today falls inside the default range) and return the panel. */
  async open(branch: { id: number; name: string }): Promise<BranchCashDay> {
    await this.page.goto('/branch-cash');
    const loaded = this.page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        r.url().includes('/api/v1/branch-cash/summary') &&
        r.url().includes(`branchId=${branch.id}`),
    );
    await this.page.getByLabel('Branch', { exact: true }).selectOption({ label: branch.name });
    expect((await loaded).ok()).toBe(true);

    await this.page
      .getByRole('row')
      .filter({ has: this.page.getByRole('cell', { name: branch.name, exact: true }) })
      .click();
    const sheet = this.page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: new RegExp(branch.name) })).toBeVisible();
    const day = new BranchCashDay(this.page, sheet);
    await expect(day.countedCash).toBeVisible();
    return day;
  }
}
