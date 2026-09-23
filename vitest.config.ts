import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // The existing specs use bare describe/it/expect (Jest-style) globals.
    globals: true,
    // Component tests (Sidebar, RouteGuard) need a DOM; the pure-helper suites
    // are unaffected by running under jsdom.
    environment: 'jsdom',
    // Full-screen renders under jsdom (the permissions matrix renders one row
    // per feature) took just over the 5 s default when the whole suite ran in
    // parallel, and failed at random. CI runners are slower still.
    testTimeout: 15_000,
    // Radix shims + jest-dom matchers; see vitest.setup.ts.
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    // Everything under src/server runs on Jest instead (see jest.config.js):
    // those suites are Jest-based (jest.fn, @nestjs/testing) and carried over
    // from louella-be unchanged. One boundary, no per-file exceptions.
    exclude: ['node_modules/**', 'src/server/**'],
  },
});
