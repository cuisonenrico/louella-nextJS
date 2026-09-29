import { test, expect } from '../fixtures/test';
import { today } from '../fixtures/dates';
import { buildWorld, managerPage } from '../fixtures/world';
import { BranchCashDay } from '../pages/branch-cash-day.page';
import { BranchCashReview } from '../pages/branch-cash-review.page';

test.describe('branch cash @stress', () => {
  test('verify is blocked while a leftover is uncounted', async ({ api, page: admin }) => {
    const world = await buildWorld(api, { products: 2 });
    const [counted, uncounted] = world.products;
    const date = today();
    const row = { branchId: world.branch.id, date, quantity: 0, delivery: 10 };
    await api.post('/inventory', { ...row, productId: counted.id, leftover: 1 });
    await api.post('/inventory', { ...row, productId: uncounted.id }); // no leftover entered

    const panel = await new BranchCashReview(admin).open(world.branch);
    await panel.setCountedCash(0); // so the ONLY thing blocking verify is the uncounted row
    await expect(panel.uncountedMessage).toBeVisible();
    await expect(panel.verifyButton).toBeDisabled();
  });

  test('reopen makes the day editable again', async ({ api, browser, page: admin }) => {
    const world = await buildWorld(api, { products: 1 });
    await api.post('/inventory', {
      branchId: world.branch.id,
      productId: world.products[0].id,
      date: today(),
      quantity: 0,
      delivery: 10,
      leftover: 2,
    });

    const panel = await new BranchCashReview(admin).open(world.branch);
    await panel.setCountedCash(0);
    await panel.verify();
    await panel.reopen();

    const manager = await managerPage(browser, world);
    const cash = await BranchCashDay.onSheet(manager, world.branch);
    await expect(cash.countedCash).toBeEnabled();
    await manager.context().close();
  });

  test('a sales change after verification shows as drift', async ({ api, page: admin }) => {
    const world = await buildWorld(api, { products: 1 });
    const created = await api.post<{ id: number }>('/inventory', {
      branchId: world.branch.id,
      productId: world.products[0].id,
      date: today(),
      quantity: 0,
      delivery: 10,
      leftover: 2,
    });

    const first = await new BranchCashReview(admin).open(world.branch);
    await first.setCountedCash(0);
    await first.verify();

    // Inventory is never locked: a later count changes sales after the day was verified.
    await api.patch('/inventory/bulk', [{ id: created.id, leftover: 1 }]);

    const again = await new BranchCashReview(admin).open(world.branch);
    await expect(again.drift).toBeVisible();
  });
});
