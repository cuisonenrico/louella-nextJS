import type { Locator, Page } from '@playwright/test';

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
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }
}
