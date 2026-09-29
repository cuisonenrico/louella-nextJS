import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /payroll/[periodStart] — src/app/(app)/payroll/[periodStart]/page.tsx.
 *
 *  - OPEN cutoff: a table with one row per employee employed in the cutoff (Working days,
 *    Absent, Worked, Basic, Holiday, Additions, Deductions, Net pay — Net pay is the last cell),
 *    then a bar with "Finalize payroll" → confirm dialog → "Finalize".
 *  - FINALIZED cutoff: the frozen payslips plus "Print payslips", "Mark as paid" and "Void run".
 *    Voiding asks for a reason (required) and reopens the cutoff.
 * The two "Void run" buttons (trigger and confirm) are told apart by scoping to the dialog.
 */
export class PayrollCutoffPage {
  constructor(private readonly page: Page) {}

  async open(periodStart: string) {
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && r.url().includes(`/api/v1/payroll/cutoffs/${periodStart}`),
    );
    await this.page.goto(`/payroll/${periodStart}`);
    expect((await loaded).ok()).toBe(true);
    await expect(this.page.getByRole('link', { name: 'All cutoffs' })).toBeVisible();
  }

  row(employeeName: string): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByText(employeeName, { exact: true }) });
  }

  /** The row's Net pay cell (the last column). */
  net(employeeName: string): Locator {
    return this.row(employeeName).getByRole('cell').last();
  }

  /** Finalize the open cutoff through the UI; returns the new run's id. */
  async finalize(periodStart: string): Promise<number> {
    await this.page.getByRole('button', { name: 'Finalize payroll' }).click();
    const dialog = this.page.getByRole('alertdialog');
    await expect(dialog.getByText(/^Finalize .+\?$/)).toBeVisible();
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes(`/api/v1/payroll/cutoffs/${periodStart}/finalize`),
    );
    await dialog.getByRole('button', { name: 'Finalize', exact: true }).click();
    const response = await done;
    expect(response.ok()).toBe(true);
    const { id } = (await response.json()) as { id: number };
    await expect(this.page.getByRole('button', { name: 'Void run' })).toBeVisible();
    return id;
  }

  async voidRun(reason: string) {
    await this.page.getByRole('button', { name: 'Void run' }).click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill(reason);
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/api\/v1\/payroll\/runs\/\d+\/void$/.test(r.url()),
    );
    await dialog.getByRole('button', { name: 'Void run' }).click();
    expect((await done).ok()).toBe(true);
    await expect(this.page.getByRole('button', { name: 'Finalize payroll' })).toBeVisible();
  }
}
