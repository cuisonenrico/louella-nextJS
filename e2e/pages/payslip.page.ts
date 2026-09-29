import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /payroll/runs/[id]/print — every payslip of a run, one PayslipView each, plus a
 * "Print N payslips" button (src/app/(app)/payroll/runs/[id]/print/page.tsx).
 */
export class PayslipPrintPage {
  constructor(private readonly page: Page) {}

  async open(runId: number, payslipCount: number) {
    await this.page.goto(`/payroll/runs/${runId}/print`);
    await expect(this.page.getByRole('button', { name: `Print ${payslipCount} payslips` })).toBeVisible();
  }

  /** One net-pay figure per payslip on the page. */
  get netAmounts(): Locator {
    return this.page.getByTestId('net-pay');
  }
}

/** /payroll/payslips/[id] — a frozen payslip. The page already exposes data-testid="net-pay". */
export class PayslipPage {
  constructor(private readonly page: Page) {}

  async open(payslipId: number) {
    await this.page.goto(`/payroll/payslips/${payslipId}`);
    await expect(this.net).toBeVisible();
  }

  get net(): Locator {
    return this.page.getByTestId('net-pay');
  }
}
