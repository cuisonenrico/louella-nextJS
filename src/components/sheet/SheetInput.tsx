'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { parseQuantityText, sanitizeDecimalText, sanitizeQuantity } from '@/lib/sheet';

interface SheetInputProps {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
  /** Move focus to the same column one row away (+1 down, -1 up). */
  onColumnMove: (dir: 1 | -1) => void;
  /** Move focus to the next/previous editable cell in linear order; returns whether it moved. */
  onLinearMove: (dir: 1 | -1) => boolean;
  /** Allow fractional quantities (e.g. material stock in kg). Integers only by default. */
  decimal?: boolean;
  className?: string;
}

/**
 * A flat, full-cell numeric input for spreadsheet-style grids: transparent
 * until focused, then lit up as the active cell. `type="text"` (not number)
 * is required so `selectionStart` is reliably reported for caret-aware
 * Left/Right cell jumping; digits are enforced by the sheet sanitizers.
 *
 * The displayed text is tracked locally while the cell is focused so that
 * in-progress decimal input ("12.") isn't destroyed by the number round-trip;
 * when unfocused, the text follows `value` (so discards/refetches show
 * through).
 */
export function SheetInput({
  id,
  value,
  onValueChange,
  onColumnMove,
  onLinearMove,
  decimal = false,
  className,
}: SheetInputProps) {
  const [text, setText] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  // Render-time sync: while not being edited, the cell always mirrors `value`.
  if (!isFocused && text !== String(value)) {
    setText(String(value));
  }

  const handleChange = (raw: string) => {
    if (decimal) {
      const cleaned = sanitizeDecimalText(raw);
      setText(cleaned);
      onValueChange(parseQuantityText(cleaned));
    } else {
      const parsed = sanitizeQuantity(raw);
      setText(String(parsed));
      onValueChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    switch (e.key) {
      case 'Enter':
      case 'ArrowDown':
        e.preventDefault();
        onColumnMove(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        onColumnMove(-1);
        break;
      case 'ArrowRight':
        // Only jump cells once the caret is at the end of the number.
        if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
          if (onLinearMove(1)) e.preventDefault();
        }
        break;
      case 'ArrowLeft':
        // Only jump cells once the caret is at the start of the number.
        if (input.selectionStart === 0 && input.selectionEnd === 0) {
          if (onLinearMove(-1)) e.preventDefault();
        }
        break;
      case 'Tab': {
        if (onLinearMove(e.shiftKey ? -1 : 1)) e.preventDefault();
        break;
      }
      default:
        break;
    }
  };

  return (
    <input
      id={id}
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={cn(
        'h-8 w-full bg-transparent px-2 text-right tabular-nums outline-none focus:bg-primary/10 focus:ring-2 focus:ring-inset focus:ring-primary',
        className,
      )}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={(e) => {
        setIsFocused(true);
        e.currentTarget.select();
      }}
      onBlur={() => {
        setIsFocused(false);
        // Normalise in-progress text ("12.") back to the committed number.
        setText(String(value));
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
