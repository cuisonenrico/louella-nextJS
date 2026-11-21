import { test, expect } from '../fixtures/test';
import { manilaToday } from '../fixtures/dates';
import { buildWorld } from '../fixtures/world';

/**
 * The payroll dashboard (/payroll) and the cutoff page's totals, status and filters.
 * Nothing here finalizes a cutoff: payroll.spec.ts owns that (desktop only), and the
 * figures read here would move under it.
 */
function currentPeriodStart(): string {
  const today = manilaToday();
  return `${today.slice(0, 8)}${Number(today.slice(8)) <= 15 ? '01' : '16'}`;
}

test.describe('payroll dashboard', () => {
  test('leads with the current cutoff and the year so far, and opens the cutoff', async ({ api, page }) => {
    await buildWorld(api, { products: 0, employees: 1 });
    await page.goto('/payroll');

    const current = page.getByRole('region', { name: 'Current cutoff' });
    await expect(current).toBeVisible();
    await expect(current.getByRole('group', { name: 'Employees' })).toContainText(/\d+/);
    await expect(current.getByRole('group', { name: 'Projected net pay' })).toContainText('₱');

    const year = manilaToday().slice(0, 4);
    const soFar = page.getByRole('region', { name: `${year} so far` });
    await expect(soFar.getByRole('group', { name: 'Net pay' })).toContainText('₱');
    await expect(soFar.getByRole('group', { name: 'Cutoffs finalized' })).toContainText(/\d+ of \d+/);
    await expect(page.getByRole('heading', { name: `Net pay per cutoff, ${year}` })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'All cutoffs' })).toBeVisible();

    await current.getByRole('link', { name: /Review cutoff|Open cutoff/ }).click();
    await expect(page).toHaveURL(new RegExp(`/payroll/${currentPeriodStart()}$`));
    await expect(page.getByRole('list', { name: 'Cutoff status' }).locator('[aria-current="step"]')).toContainText(
      /Open|Finalized|Paid/,
    );
  });

  test('the cutoff page totals what it shows, and search narrows it', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 0, employees: 2 });
    const firstName = world.employees[0].firstName;
    await page.goto(`/payroll/${currentPeriodStart()}`);
    await expect(page.getByRole('link', { name: 'All cutoffs' })).toBeVisible();

    const totals = page.getByRole('region', { name: 'Cutoff totals' });
    await expect(totals.getByRole('group', { name: 'Net pay' })).toContainText('₱');

    const search = page.getByRole('searchbox', { name: 'Search employees' });
    await search.fill(firstName);
    // This world's two employees, and the Employees figure says how many of all.
    await expect(page.getByRole('row').filter({ hasText: firstName })).toHaveCount(2);
    await expect(totals.getByRole('group', { name: 'Employees' })).toContainText(/^Employees2 of \d+$/);

    await search.fill('zz-nobody-has-this-name');
    await expect(page.getByText('No employee matches these filters.')).toBeVisible();
    await expect(totals.getByRole('group', { name: 'Net pay' })).toContainText('₱0.00');
  });
});
