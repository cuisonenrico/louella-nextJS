import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_BREAKPOINT_PX, useIsMobile } from './useIsMobile';

/**
 * Drives a controllable matchMedia so the hook can be tested without a real
 * viewport. vitest.setup.ts installs a stub that always reports
 * `matches: false`; this replaces it per-test so both branches are exercised.
 */
function installMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = ((query: string) => ({
    ...mql,
    media: query,
  })) as unknown as typeof window.matchMedia;
  return {
    emit(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the shell breakpoint so CSS and JS cannot drift', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(768);
  });

  it('reports false on a wide viewport', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('reports true on a narrow viewport', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when the viewport crosses the breakpoint', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.emit(true));
    expect(result.current).toBe(true);
  });

  it('queries strictly below the breakpoint, so md itself is desktop', () => {
    // Tailwind's `md:` applies at >= 768px. The hook must agree, or a viewport
    // at exactly 768 gets the desktop sidebar and the mobile dialog.
    const spy = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    window.matchMedia = spy as unknown as typeof window.matchMedia;
    renderHook(() => useIsMobile());
    expect(spy).toHaveBeenCalledWith('(max-width: 767px)');
  });
});
