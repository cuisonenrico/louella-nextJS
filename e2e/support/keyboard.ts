import type { Page } from '@playwright/test';

/**
 * Pretend an on-screen keyboard covers the bottom 300px whenever the page loads.
 *
 * Headless Chromium has no virtual keyboard, so the visual viewport never shrinks and the keypad
 * bar (`src/components/mobile/KeypadBar.tsx`) — which shows only while a keyboard is up — would
 * never appear. Applies to navigations after the call; reload if the page is already open.
 */
export async function fakeOnScreenKeyboard(page: Page) {
  await page.addInitScript(() => {
    const vv = new EventTarget();
    Object.defineProperties(vv, {
      width: { get: () => window.innerWidth },
      height: { get: () => window.innerHeight - 300 },
      offsetTop: { value: 0 },
      offsetLeft: { value: 0 },
      pageTop: { get: () => window.scrollY },
      pageLeft: { get: () => window.scrollX },
      scale: { value: 1 },
    });
    Object.defineProperty(window, 'visualViewport', { get: () => vv, configurable: true });
  });
}
