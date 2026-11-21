import { test, expect } from '../fixtures/test';
import { addDays, today } from '../fixtures/dates';

// The bakery's day is Manila's, whatever zone the device is set to. These pages used to
// take "today" from the device clock (dayjs()), so a device in another zone opened them on
// the wrong day. Honolulu (UTC−10) is a calendar day behind Manila until 18:00 Manila, so
// for most of the day the old code fails here; the fixed code passes at any hour.
test.use({ timezoneId: 'Pacific/Honolulu' });

test.describe("pages open on Manila's today on a device in another zone", () => {
  test('sales defaults to the last 7 days ending today', async ({ page }) => {
    await page.goto('/sales');
    const dates = page.locator('input[type="date"]');
    await expect(dates.nth(0)).toHaveValue(addDays(today(), -7));
    await expect(dates.nth(1)).toHaveValue(today());
  });

  test('inventory adjustments open on today', async ({ page }) => {
    await page.goto('/inventory-adjustments');
    await expect(page.locator('input#date')).toHaveValue(today());
  });
});
