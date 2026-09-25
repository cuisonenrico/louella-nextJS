'use client';

import { useEffect } from 'react';

/**
 * Slides to in-page sections (`#breads`, `#branches`…) instead of jumping,
 * closes the mobile menu on tap, and moves focus to the section so keyboard
 * and screen-reader users land where sighted users do. Sections carry
 * `scroll-mt-*`, so the sticky header never covers the heading.
 *
 * One document listener rather than per-link handlers, so the section
 * components stay server-renderable. Clicks already cancelled (the editor
 * preview cancels every link) are left alone.
 */
export default function SmoothAnchors() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a');
      if (!link) return;
      link.closest('details')?.removeAttribute('open');

      const href = link.getAttribute('href') ?? '';
      if (!href.startsWith('#')) return;
      const id = decodeURIComponent(href.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;

      e.preventDefault();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (location.hash !== href) history.pushState(null, '', href);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
