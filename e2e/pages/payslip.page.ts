import { expect, type Locator, type Page } from '@playwright/test';

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
