import { vi } from 'vitest';

/**
 * Installs a controllable `window.matchMedia`.
 *
 * `vitest.setup.ts` provides a stub that always reports `matches: false`, which
 * is enough for Radix but means a breakpoint-sensitive component can only ever
 * be tested on its desktop branch. This replaces it per-test so both branches
 * are exercised, and lets a test emit a change to simulate a resize.
 */
export function installMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const state = { matches };

  window.matchMedia = ((query: string) => ({
    get matches() {
      return state.matches;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  return {
    emit(next: boolean) {
      state.matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}
