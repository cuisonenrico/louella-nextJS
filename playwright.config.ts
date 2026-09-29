import { defineConfig, devices } from '@playwright/test';
import {
  allTemplateKeys,
  assertEnvComplete,
  assertNoApiUrlOverride,
  assertSafeDatabase,
  loadE2eEnv,
} from './e2e/support/env';

/**
 * E2E suite. Runs a production build on :4100 against the throwaway
 * louella_e2e database (docker-compose.e2e.yml). Never against .env.
 * Start the database first: npm run e2e:db
 */
const env = loadE2eEnv();
assertSafeDatabase(env);
assertNoApiUrlOverride();
// Here, not in globalSetup: Playwright starts the webServer (build + start) BEFORE globalSetup runs, so a
// check there would come after a key had already fallen through from .env to the e2e server.
assertEnvComplete(env, allTemplateKeys());
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: CI ? 2 : 4,
  retries: CI ? 1 : 0,
  reporter: CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  outputDir: 'e2e-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Manila',
  },
  webServer: {
    command: 'npm run build && npx next start -p 4100',
    url: 'http://localhost:4100/login',
    env: { ...(process.env as Record<string, string>), ...env },
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  // No shared storageState / setup project: each test signs in on its own
  // (fixtures/test.ts), because a refresh token cannot be shared across tests.
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet-webkit',
      use: { ...devices['iPad (gen 7) landscape'] },
      // Runs AFTER desktop, not beside it: payroll finalizes one shared cutoff, so two projects
      // running it at the same time would collide. (Also skips webkit if desktop already failed.)
      dependencies: ['desktop-chromium'],
    },
  ],
});
