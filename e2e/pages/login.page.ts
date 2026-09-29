import { expect, type Locator, type Page } from '@playwright/test';

/** /login — src/app/login/page.tsx: labelled Email / Password, "Sign In" button, error in an <Alert>. */
export class LoginPage {
  // Next's route announcer also has role="alert", so filter to the login error.
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.error = page.getByRole('alert').filter({ hasText: /invalid email or password/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    // Filling before React hydrates can be undone when it does (seen on WebKit: the Email box came
    // back empty, and the browser's `required` check then swallowed the submit with no request and
    // no error). So fill until the value sticks.
    for (const [label, value] of [['Email', email], ['Password', password]] as const) {
      const field = this.page.getByLabel(label);
      await expect(async () => {
        await field.fill(value);
        await expect(field).toHaveValue(value);
      }).toPass();
    }
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }
}
