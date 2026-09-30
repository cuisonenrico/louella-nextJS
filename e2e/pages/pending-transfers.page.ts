import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The "Transfers awaiting confirmation" card on /inventory/details
 * (src/app/(app)/inventory/components/PendingTransfersPanel.tsx).
 *
 * It shows the same pending transfer to both branches: the receiver sees "Incoming" with Accept and
 * Reject; the sender sees "Sent" and "Awaiting <receiver>". It renders nothing when none is pending.
 * A world has its own branches and product, so at most one transfer is pending per branch in a test
 * and the buttons need no further scoping.
 */
export class PendingTransfers {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.locator('div.shadow-sm').filter({ has: this.page.getByText('Transfers awaiting confirmation') });
  }

  /** "12 × Product" appears in the card — for either side. */
  line(value: number, productName: string): Locator {
    return this.panel.getByText(`${value} × ${productName}`, { exact: true });
  }

  get incomingBadge(): Locator {
    return this.panel.getByText('Incoming', { exact: true });
  }

  get sentBadge(): Locator {
    return this.panel.getByText('Sent', { exact: true });
  }

  awaiting(receiverName: string): Locator {
    return this.panel.getByText(`Awaiting ${receiverName}`, { exact: true });
  }

  async accept() {
    await this.answer('Accept', 'accept');
  }

  async reject() {
    await this.answer('Reject', 'reject');
  }

  private async answer(button: 'Accept' | 'Reject', verb: 'accept' | 'reject') {
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && new RegExp(`/api/v1/inventory-adjustments/\\d+/${verb}$`).test(r.url()),
    );
    await this.panel.getByRole('button', { name: button, exact: true }).click();
    expect((await done).ok()).toBe(true);
    // Answered: the card disappears once nothing else is pending.
    await expect(this.panel).toHaveCount(0);
  }
}
