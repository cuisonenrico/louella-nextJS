import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';

test('world builds an isolated branch with a working manager', async ({ api, browser }) => {
  const world = await buildWorld(api, { products: 2, withRecipe: true, employees: 1 });
  expect(world.products).toHaveLength(2);
  expect(world.recipe?.gramsPerUnit).toBe(50);
  expect(world.employees[0].dailyRate).toBe(600);

  const page = await managerPage(browser, world);
  await page.goto('/dashboard');
  // Let AuthContext finish re-minting the token; a bad session would redirect to /login by then.
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().close();
});

test('two worlds never share a branch', async ({ api }) => {
  const [a, b] = await Promise.all([buildWorld(api), buildWorld(api)]);
  expect(a.branch.id).not.toBe(b.branch.id);
  expect(a.id).not.toBe(b.id);
});
