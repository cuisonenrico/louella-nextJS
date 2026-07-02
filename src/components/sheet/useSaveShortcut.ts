'use client';

import { useEffect } from 'react';

/**
 * Ctrl+S / Cmd+S saves pending sheet changes — the Excel muscle-memory the
 * grids are built around. Only intercepts the browser save dialog while
 * `enabled` (i.e. there is something to save and no save is in flight).
 */
export function useSaveShortcut(enabled: boolean, onSave: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onSave]);
}
