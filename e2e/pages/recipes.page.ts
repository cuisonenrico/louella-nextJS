import { expect, type Locator, type Page } from '@playwright/test';

export interface IngredientInput {
  material: string;
  quantity: number;
  unit?: string;
}

/**
 * /recipes — src/app/(app)/recipes/page.tsx.
 *
 * One card per recipe, titled by its product: "Yield: N · M ingredient(s)", a "Show ingredients"
 * toggle, and Cost / Edit / Delete (the delete button is icon-only, found by its trash icon).
 * The New/Edit dialog has Product (create only), Yield (batches), Notes, and a row per ingredient
 * (a material Select, a "Qty" input, a unit Select). The cards live in the list, so open() searches
 * by product to keep the page small.
 */
export class RecipesPage {
  constructor(private readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async open() {
    const loaded = this.page.waitForResponse(
      (r) => r.request().method() === 'GET' && /\/api\/v1\/recipes(\?.*)?$/.test(r.url()),
    );
    await this.page.goto('/recipes');
    expect((await loaded).ok()).toBe(true);
    await expect(this.page.getByRole('button', { name: 'New Recipe' })).toBeVisible();
  }

  async search(product: string) {
    await this.page.getByPlaceholder('Search by product…').fill(product);
  }

  card(product: string): Locator {
    return this.page.locator('div.shadow-sm').filter({ has: this.page.getByText(product, { exact: true }) });
  }

  async openCreate() {
    await this.page.getByRole('button', { name: 'New Recipe' }).click();
    await expect(this.dialog.getByRole('heading', { name: 'New Recipe' })).toBeVisible();
  }

  async openEdit(product: string) {
    await this.card(product).getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(this.dialog.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
  }

  async chooseProduct(product: string) {
    await this.dialog.getByLabel('Product', { exact: true }).click();
    await this.page.getByRole('option', { name: product, exact: true }).click();
  }

  async setYield(value: number) {
    await this.dialog.getByLabel('Yield (batches)').fill(String(value));
  }

  async setNotes(value: string) {
    await this.dialog.getByLabel('Notes').fill(value);
  }

  /** The ingredient rows in the dialog (each holds two comboboxes and a "Qty" input). */
  private ingredientRow(index: number): Locator {
    return this.dialog.locator('div.flex.gap-2.items-end').nth(index);
  }

  /** Fill row `index`, adding a row first when it does not exist yet. */
  async setIngredient(index: number, ing: IngredientInput) {
    while ((await this.dialog.locator('div.flex.gap-2.items-end').count()) <= index) {
      await this.dialog.getByRole('button', { name: 'Add', exact: true }).click();
    }
    const row = this.ingredientRow(index);
    await row.getByRole('combobox').first().click();
    await this.page.getByRole('option', { name: ing.material, exact: true }).click();
    await row.getByPlaceholder('Qty').fill(String(ing.quantity));
    if (ing.unit) {
      await row.getByRole('combobox').nth(1).click();
      await this.page.getByRole('option', { name: ing.unit, exact: true }).click();
    }
  }

  async removeIngredient(index: number) {
    await this.ingredientRow(index).locator('button:has(svg.lucide-trash-2)').click();
  }

  async save(): Promise<{ status: number }> {
    const done = this.page.waitForResponse(
      (r) => ['POST', 'PATCH'].includes(r.request().method()) && /\/api\/v1\/recipes(\/\d+)?$/.test(r.url()),
    );
    await this.dialog.getByRole('button', { name: 'Save', exact: true }).click();
    return { status: (await done).status() };
  }

  get formError(): Locator {
    return this.dialog.getByRole('alert');
  }

  async showIngredients(product: string) {
    await this.card(product).getByRole('button', { name: /ingredients$/ }).click();
  }

  /** Open the cost breakdown for a recipe; resolves to the dialog. */
  async openCost(product: string): Promise<Locator> {
    await this.card(product).getByRole('button', { name: 'Cost', exact: true }).click();
    await expect(this.dialog.getByRole('heading', { name: 'Cost Breakdown' })).toBeVisible();
    return this.dialog;
  }

  async remove(product: string) {
    await this.card(product).locator('button:has(svg.lucide-trash-2)').click();
    const confirm = this.page.getByRole('alertdialog');
    await expect(confirm.getByRole('heading', { name: 'Delete Recipe' })).toBeVisible();
    const done = this.page.waitForResponse(
      (r) => r.request().method() === 'DELETE' && /\/api\/v1\/recipes\/\d+$/.test(r.url()),
    );
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    expect((await done).ok()).toBe(true);
  }
}
