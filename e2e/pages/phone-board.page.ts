import { expect, type Locator, type Page } from '@playwright/test';

/**
 * /production on a phone — the board's list + product sheet
 * (src/app/(app)/production/components/phone/).
 *
 *  - Rows are buttons named by the product; figures carry `data-field` (planned, yield, diff).
 *  - Tapping a row opens a bottom sheet (dialog named by the product) with a "Yield" stepper and
 *    one stepper per branch, labelled by the branch name. Editing needs `production:create` and
 *    `all-branches`; everyone else gets the sheet read-only.
 *  - "Save & next" queues the product on the phone; the sync chip ([role=status]) reports it.
 */
export type BoardField = 'planned' | 'yield' | 'diff';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class PhoneBoard {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.goto('/production');
    await expect(this.page.getByText(/products have yield|Read-only — the kitchen sets the yield/)).toBeVisible();
  }

  row(product: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${escape(product)}(\\s|$)`) });
  }

  rowField(product: string, field: BoardField): Locator {
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

  async set(label: string, value: number) {
    await this.sheet().getByRole('textbox', { name: label, exact: true }).fill(String(value));
  }

  saveButton(): Locator {
    return this.sheet().getByRole('button', { name: /Save & next/ });
  }

  /** CSS, not getByRole: the open sheet marks the page behind it aria-hidden. */
  sync(): Locator {
    return this.page.locator('[role="status"]').filter({ hasText: /Saved|waiting for signal|couldn't save/ });
  }
}
