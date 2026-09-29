import { test as base, expect } from '@playwright/test';
import { Api } from './api';
import { buildWorld, type World } from './world';
import { ADMIN } from '../support/credentials';

type TestFixtures = { world: World };
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
  world: async ({ api }, use) => {
    await use(await buildWorld(api));
  },
});

export { expect };
