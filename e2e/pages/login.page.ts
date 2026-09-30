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

  /**
   * Fill the form and submit it, and return once the login has visibly happened: the page left
   * /login, or the app showed its "Invalid email or password" error.
   *
   * Why not just fill and click: React hydrates this form AFTER the page is interactive, and hydration
   * resets the controlled inputs. On WebKit under load the Email box came back empty after we had
   * typed into it — even after a check that the value had stuck — and the browser's `required` check
   * then swallowed the click with no request and no error (18% of runs in a concurrent stress).
   * So an attempt only counts once one of the two outcomes is observed; if neither shows up, the
   * submit never ran and the whole attempt (fill, then click) is repeated.
   */
  async login(email: string, password: string) {
    await expect(async () => {
      await this.page.getByLabel('Email').fill(email);
      await this.page.getByLabel('Password').fill(password);
      await this.page.getByRole('button', { name: 'Sign In' }).click();
      // Promise.any, not race: the loser's timeout must not surface as an unhandled rejection.
      await Promise.any([
        this.page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 5_000 }),
        this.error.waitFor({ state: 'visible', timeout: 5_000 }),
      ]);
    }).toPass({ timeout: 45_000 });
  }
}
