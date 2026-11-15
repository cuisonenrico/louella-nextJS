'use client';

import { useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Marks the inputs the bar's Next walks through, in page order. */
export const KEYPAD_FIELD = 'data-keypad-field';

const BAR_HEIGHT = 48;
/** A visual viewport this much shorter than the layout viewport means an on-screen keyboard. */
const KEYBOARD_MIN = 150;

function subscribe(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  vv?.addEventListener('scroll', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    vv?.removeEventListener('scroll', onChange);
  };
}

/** Where the top of the bar goes so it sits on the keyboard, or `null` when no keyboard is up. */
function keyboardTop(): number | null {
  const vv = window.visualViewport;
  if (!vv) return null;
  const covered = document.documentElement.clientHeight - vv.height * vv.scale;
  return covered > KEYBOARD_MIN ? vv.offsetTop + vv.height - BAR_HEIGHT : null;
}

/** The keypad field after `input`, within the same dialog (or the page). */
function nextField(input: HTMLInputElement): HTMLInputElement | null {
  const scope: ParentNode = input.closest('[role="dialog"]') ?? document;
  const fields = [...scope.querySelectorAll<HTMLInputElement>(`input[${KEYPAD_FIELD}]:not(:disabled)`)];
  return fields[fields.indexOf(input) + 1] ?? null;
}

export function focusNextField(input: HTMLInputElement): boolean {
  const next = nextField(input);
  if (!next) return false;
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'center' });
  return true;
}

/**
 * Next / Done on top of the phone keyboard while `input` (the focused field) has focus.
 *
 * The digit keypad on iPhone has no return key and web pages cannot add one,
 * so every phone gets this bar instead — the same on iOS and Android. It shows
 * only while an on-screen keyboard is up (the visual viewport has shrunk).
 *
 * Its buttons cancel `mousedown`, so tapping them never takes focus from the
 * input: the keyboard stays open for Next, and the bar is not unmounted by the
 * input's blur before the tap lands.
 */
export function KeypadBar({ input }: { input: HTMLInputElement | null }) {
  const top = useSyncExternalStore(subscribe, keyboardTop, () => null);
  if (!input || top === null) return null;
  const hasNext = nextField(input) !== null;
  const keep = (e: MouseEvent) => e.preventDefault();

  return createPortal(
    <div
      role="toolbar"
      aria-label="Keypad"
      // Above sheets (z-50); pointer-events-auto because a modal sheet turns them off on <body>.
      className="pointer-events-auto fixed inset-x-0 z-[60] flex items-center justify-end gap-2 border-t bg-muted px-2"
      style={{ top, height: BAR_HEIGHT }}
    >
      <Button type="button" variant="ghost" className="h-10" onMouseDown={keep} onClick={() => input.blur()}>
        Done
      </Button>
      {hasNext ? (
        <Button type="button" className="h-10" onMouseDown={keep} onClick={() => focusNextField(input)}>
          Next <ChevronRight data-icon="inline-end" />
        </Button>
      ) : null}
    </div>,
    document.body,
  );
}
