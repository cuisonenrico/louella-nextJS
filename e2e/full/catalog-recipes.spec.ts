import { test, expect } from '../fixtures/test';
import { buildWorld } from '../fixtures/world';
import { uniqueName } from '../fixtures/names';
import { RecipesPage } from '../pages/recipes.page';
import type { Api } from '../fixtures/api';

interface Material {
  id: number;
  name: string;
}
interface Product {
  id: number;
  name: string;
}
interface Recipe {
  id: number;
  productId: number;
  recipeYield: number;
  notes: string | null;
  recipeItems: Array<{ materialId: number; quantity: number; unit: string }>;
}
interface Cost {
  totalBatchCost: number;
  costPerUnit: number;
}

/** KG↔G is shared by every test that needs it; a second creator gets a 409, which is fine. */
async function ensureKgToG(api: Api) {
  await api.raw('POST', '/unit-conversions', { fromUnit: 'KG', toUnit: 'G', factor: 1000 });
  await api.raw('POST', '/unit-conversions', { fromUnit: 'G', toUnit: 'KG', factor: 0.001 });
}

async function bareProduct(api: Api, label: string) {
  return api.post<Product>('/products', { name: uniqueName(label), type: 'BREAD', price: 30 });
}
const byProduct = (api: Api, productId: number) => api.raw('GET', `/recipes/product/${productId}`);

/**
 * Recipes (src/app/(app)/recipes): one recipe per product — yield, notes and ingredient lines in any
 * unit that converts to the material's own. Cost = Σ(qty in the material's unit × its price) ÷ yield.
 */
test.describe('catalog: recipes @stress', () => {
  test('create: yield, notes and ingredients are stored and the cost follows the rule', async ({ api, page }) => {
    await ensureKgToG(api);
    const flour = await api.post<Material>('/materials', { name: uniqueName('Flour'), unit: 'KG', pricePerUnit: 40 });
    const product = await bareProduct(api, 'Loaf');
    const recipes = new RecipesPage(page);
    await recipes.open();
    await recipes.openCreate();
    await recipes.chooseProduct(product.name);
    await recipes.setYield(10);
    await recipes.setNotes('Overnight bake');
    await recipes.setIngredient(0, { material: flour.name, quantity: 500, unit: 'G' });
    expect((await recipes.save()).status).toBe(201);

    const stored = await (await byProduct(api, product.id)).json();
    expect(stored).toMatchObject({ recipeYield: 10, notes: 'Overnight bake' });
    expect(stored.recipeItems).toMatchObject([{ materialId: flour.id, quantity: 500, unit: 'G' }]);

    // 500 G = 0.5 KG at ₱40/KG = ₱20 a batch; ÷ 10 = ₱2 a unit.
    const cost = await api.get<Cost>(`/recipes/${stored.id}/cost`);
    expect(cost.totalBatchCost).toBe(20);
    expect(cost.costPerUnit).toBe(2);
  });

  test('an ingredient is required — nothing is created', async ({ api, page }) => {
    const product = await bareProduct(api, 'Empty');
    const recipes = new RecipesPage(page);
    await recipes.open();
    await recipes.openCreate();
    await recipes.chooseProduct(product.name);
    await recipes.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(recipes.formError).toContainText('At least one ingredient is required');
    expect((await byProduct(api, product.id)).status()).toBe(404);
  });

  test('a product can have only one recipe', async ({ api }) => {
    const w = await buildWorld(api, { withRecipe: true });
    const res = await api.raw('POST', '/recipes', {
      productId: w.products[0].id,
      items: [{ materialId: w.material!.id, quantity: 10, unit: 'G' }],
    });
    expect(res.status()).toBe(409);
  });

  test('an ingredient in a unit that cannot be converted to the material\'s is refused (422)', async ({ api, page }) => {
    // KG material, PIECE ingredient: no such conversion exists or is ever created by any test.
    const flour = await api.post<Material>('/materials', { name: uniqueName('Odd'), unit: 'KG', pricePerUnit: 10 });
    const product = await bareProduct(api, 'Odd loaf');
    const recipes = new RecipesPage(page);
    await recipes.open();
    await recipes.openCreate();
    await recipes.chooseProduct(product.name);
    await recipes.setIngredient(0, { material: flour.name, quantity: 3, unit: 'PIECE' });
    expect((await recipes.save()).status).toBe(422);
    await expect(recipes.formError).toContainText(/No unit conversion/i);
    expect((await byProduct(api, product.id)).status()).toBe(404);
  });

  test('edit: yield, notes and quantity change; the cost moves with them', async ({ api, page }) => {
    await ensureKgToG(api);
    const flour = await api.post<Material>('/materials', { name: uniqueName('Flour'), unit: 'KG', pricePerUnit: 40 });
    const product = await bareProduct(api, 'Edited');
    const made = await api.post<Recipe>('/recipes', {
      productId: product.id,
      recipeYield: 10,
      items: [{ materialId: flour.id, quantity: 500, unit: 'G' }],
    });
    const recipes = new RecipesPage(page);
    await recipes.open();
    await recipes.search(product.name);

    await recipes.openEdit(product.name);
    await recipes.setYield(20);
    await recipes.setNotes('Bigger batch');
    await recipes.setIngredient(0, { material: flour.name, quantity: 1000, unit: 'G' });
    expect((await recipes.save()).status).toBe(200);

    const stored = await api.get<Recipe>(`/recipes/${made.id}`);
    expect(stored).toMatchObject({ recipeYield: 20, notes: 'Bigger batch' });
    expect(stored.recipeItems).toMatchObject([{ quantity: 1000, unit: 'G' }]);
    // 1000 G = 1 KG = ₱40 a batch; ÷ 20 = ₱2 a unit.
    const cost = await api.get<Cost>(`/recipes/${made.id}/cost`);
    expect(cost).toMatchObject({ totalBatchCost: 40, costPerUnit: 2 });
  });

  test('delete, then creating a recipe for the same product revives it', async ({ api, page }) => {
    const w = await buildWorld(api, { withRecipe: true });
    const product = w.products[0];
    const recipes = new RecipesPage(page);
    await recipes.open();
    await recipes.search(product.name);
    await recipes.remove(product.name);
    expect((await api.raw('GET', `/recipes/${w.recipe!.id}`)).status()).toBe(404);
    expect((await byProduct(api, product.id)).status()).toBe(404);

    const again = await api.raw('POST', '/recipes', {
      productId: product.id,
      recipeYield: 2,
      items: [{ materialId: w.material!.id, quantity: 80, unit: 'G' }],
    });
    expect(again.status()).toBe(201);
    const revived = await (await byProduct(api, product.id)).json();
    expect(revived).toMatchObject({ recipeYield: 2 });
    expect(revived.recipeItems).toMatchObject([{ quantity: 80, unit: 'G' }]);
  });
});
