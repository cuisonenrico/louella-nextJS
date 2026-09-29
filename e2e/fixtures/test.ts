import { test as base, expect } from '@playwright/test';
import { Api } from './api';
import { buildWorld, type World } from './world';
import { ADMIN } from '../support/credentials';

type TestFixtures = { world: World; asAdmin: boolean };
type WorkerFixtures = { api: Api };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  api: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({ baseURL: 'http://localhost:4100' });
      await use(await Api.login(request, ADMIN));
      await request.dispose();
    },
    { scope: 'worker' },
  ],

  /** Set `test.use({ asAdmin: false })` for tests that start signed out. */
  asAdmin: [true, { option: true }],

  /**
   * Each test's `page` is signed in as admin with its OWN refresh token.
   * A shared storageState file would not survive: refresh rotates the token and
   * the old one only lives on for a 60 s grace window (auth.service.ts).
   */
  context: async ({ context, asAdmin }, use) => {
    if (asAdmin) {
      const res = await context.request.post('/api/v1/auth/login', { data: ADMIN });
      if (!res.ok()) throw new Error(`admin login → ${res.status()}: ${await res.text()}`);
    }
    await use(context);
  },

  world: async ({ api }, use) => {
    await use(await buildWorld(api));
  },
});

export { expect };
