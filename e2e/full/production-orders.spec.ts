import { test, expect } from '../fixtures/test';
import type { Api } from '../fixtures/api';
import { today } from '../fixtures/dates';
import { buildWorld } from '../fixtures/world';
import { ProductionOrdersPage } from '../pages/production-orders.page';
import { KITCHEN_BRANCH_ID } from '../support/credentials';
import type { SalesDay } from '../support/types';

// --- API cross-checks, always as admin (shapes verified against the services named). ---

/** GET /sales/branch/:id/date → breakdown[].delivery (sales.service.ts getByBranchAndDate). */
async function branchDelivery(api: Api, branchId: number, productId: number, date: string): Promise<number> {
  const day = await api.get<SalesDay>(`/sales/branch/${branchId}/date`, { date });
  return day.breakdown.find((r) => r.product.id === productId)?.delivery ?? 0;
}

/** GET /material-inventory/by-date → MaterialInventory rows; `used` = consumed by production that day. */
async function materialUsed(api: Api, materialId: number, date: string): Promise<number> {
  const rows = await api.get<Array<{ materialId: number; used: number }>>('/material-inventory/by-date', { date });
  return Number(rows.find((r) => r.materialId === materialId)?.used ?? 0);
}

/** GET /production/branch/:kitchen/date → Production rows; finalized orders add to the kitchen's yield. */
async function kitchenYield(api: Api, productId: number, date: string): Promise<number> {
  const rows = await api.get<Array<{ productId: number; yield: number }>>(
    `/production/branch/${KITCHEN_BRANCH_ID}/date`,
    { date },
  );
  return rows.find((r) => r.productId === productId)?.yield ?? 0;
}

test.describe('production orders @stress', () => {
  test('two finalized orders sum into yield, delivery and material use', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1, withRecipe: true });
    const product = world.products[0];
    const date = today();

    // Setup, not the behaviour under test: give the material stock to consume.
    await api.post('/material-inventory', { materialId: world.material!.id, date, delivery: 100_000 });

    const usedBefore = await materialUsed(api, world.material!.id, date);
    const deliveryBefore = await branchDelivery(api, world.branch.id, product.id, date);
    const yieldBefore = await kitchenYield(api, product.id, date);

    const orders = new ProductionOrdersPage(page);
    await orders.open(world.branch, date);
    const first = await orders.create([{ productName: product.name, yield: 12 }]);
    const second = await orders.create([{ productName: product.name, yield: 8 }]);
    await orders.finalize(first);
    await orders.finalize(second);

    // Several orders for one product and day add up.
    const total = 12 + 8;
    expect(await branchDelivery(api, world.branch.id, product.id, date)).toBe(deliveryBefore + total);
    expect(await kitchenYield(api, product.id, date)).toBe(yieldBefore + total);
    // Finalizing consumes the recipe's materials: grams per unit × units made.
    expect(await materialUsed(api, world.material!.id, date)).toBeCloseTo(
      usedBefore + total * world.recipe!.gramsPerUnit,
      4,
    );
  });

  test('a cancelled order stays listed and moves no stock', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1, withRecipe: true });
    const product = world.products[0];
    const date = today();
    const deliveryBefore = await branchDelivery(api, world.branch.id, product.id, date);
    const yieldBefore = await kitchenYield(api, product.id, date);

    const orders = new ProductionOrdersPage(page);
    await orders.open(world.branch, date);
    const id = await orders.create([{ productName: product.name, yield: 5 }]);
    await orders.cancel(id);

    // Audit trail: the order is kept, not deleted.
    await expect(orders.card(id)).toBeVisible();
    const listed = await api.get<Array<{ id: number; status: string }>>('/production-orders/by-date', {
      date,
      branchId: world.branch.id,
    });
    expect(listed.find((o) => o.id === id)?.status).toBe('CANCELLED');

    expect(await branchDelivery(api, world.branch.id, product.id, date)).toBe(deliveryBefore);
    expect(await kitchenYield(api, product.id, date)).toBe(yieldBefore);
  });
});
