import { test, expect } from '../fixtures/test';
import { today } from '../fixtures/dates';
import { buildWorld, managerPage } from '../fixtures/world';
import { BranchCashDay } from '../pages/branch-cash-day.page';
import { BranchCashReview } from '../pages/branch-cash-review.page';
import { money } from '../support/format';
import type { SalesDay } from '../support/types';

test.describe('branch cash @smoke @stress', () => {
  test('expected cash = sales − expenses − vale; verify locks the day', async ({ api, browser, page: admin }) => {
    const world = await buildWorld(api, { products: 1, employees: 1 });
    const product = world.products[0];
    const employee = world.employees[0];
    const date = today();
    const delivery = 20;
    const leftover = 5;
    const expense = 30;
    const vale = 40;

    // Setup through the API (the sheet has its own tests): a counted day for the branch.
    await api.post('/inventory', {
      branchId: world.branch.id,
      productId: product.id,
      date,
      quantity: 0,
      delivery,
      leftover,
    });
    const sales = product.price * (delivery - leftover);
    const expected = sales - expense - vale;

    // The manager records the drawer.
    const manager = await managerPage(browser, world);
    const cash = await BranchCashDay.onSheet(manager, world.branch);
    await cash.addExpense('E2E Supplies', expense);
    await cash.addVale(`${employee.firstName} ${employee.lastName}`, vale);
    await expect(cash.figure('sales')).toHaveText(money(sales));
    await expect(cash.figure('expenses')).toHaveText(money(expense));
    await expect(cash.figure('vale')).toHaveText(money(vale));
    await expect(cash.figure('expected')).toHaveText(money(expected));
    await cash.setCountedCash(expected);
    await expect(manager.getByText('Balanced', { exact: true })).toBeVisible();

    // Sales comes from the sales service, so the panel matches the sales page.
    const day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date });
    expect(day.totals.totalSales).toBe(sales);

    // The admin verifies…
    const review = await new BranchCashReview(admin).open(world.branch);
    await review.verify();

    // …and the manager's day is locked.
    const locked = await BranchCashDay.onSheet(manager, world.branch);
    await expect(locked.countedCash).toBeDisabled();
    await expect(locked.reopenButton).toHaveCount(0); // only an admin can reopen
    await manager.context().close();
  });
});
