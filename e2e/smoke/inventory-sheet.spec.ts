import { test } from '../fixtures/test';
import { today, yesterday } from '../fixtures/dates';
import { buildWorld } from '../fixtures/world';
import { InventorySheet } from '../pages/inventory-sheet.page';

test.describe('inventory sheet @smoke @stress', () => {
  test("sold is derived and today opens at yesterday's close", async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1 });
    const product = world.products[0].name;
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, yesterday(), [product]);
    const opening = 0; // a brand-new branch has no earlier day
    const delivery = 40;
    const reject = 3;
    const leftover = 7;
    await sheet.expectNumber(product, 'Prev. Leftover', opening);
    await sheet.enter(product, { delivery, reject, leftover });

    // sold = quantity + delivery + Σadj − leftover − reject   (no adjustments here)
    await sheet.expectNumber(product, 'Total Stock', opening + delivery);
    await sheet.expectNumber(product, 'Sold', opening + delivery - leftover - reject);

    // Opening stock always equals the previous day's close — a counted leftover.
    await sheet.open(world.branch.name, today(), [product]);
    await sheet.expectNumber(product, 'Prev. Leftover', leftover);
  });
});
