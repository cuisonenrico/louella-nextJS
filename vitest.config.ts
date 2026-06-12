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
    // Current suites cover pure helpers; node is enough. Switch to 'jsdom'
    // (and add @testing-library/react) when component tests are introduced.
    environment: 'node',
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
  },
});
