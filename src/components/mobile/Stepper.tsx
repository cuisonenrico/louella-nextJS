'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { KEYPAD_FIELD, KeypadBar, focusNextField } from './KeypadBar';

interface StepperProps {
  label: string;
  /** `null` = nothing entered (an uncounted leftover), shown as the placeholder. */
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A whole-number field with 44px − / + buttons, for counting on a phone.
 *
 * Text input with a numeric keypad rather than `type="number"`: number inputs
 * accept "1e3" and "-", and scroll-wheel changes. Anything but digits is
 * dropped, so the value is always an integer ≥ `min` or empty.
 *
 * While it has focus a Next / Done bar rides on the keyboard (`KeypadBar`);
 * Enter on a keyboard that has one does the same as Next.
 */
export function Stepper({ label, value, onChange, min = 0, placeholder = '–', disabled, className }: StepperProps) {
  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    onChange(digits === '' ? null : Math.max(min, Number.parseInt(digits, 10)));
  };
  const [focused, setFocused] = useState<HTMLInputElement | null>(null);

  return (
    <div className={cn('flex items-stretch overflow-hidden rounded-lg border border-input bg-background', className)}>
      <Button
        type="button"
        variant="ghost"
        className="size-11 shrink-0 rounded-none"
        aria-label={`Decrease ${label}`}
        disabled={disabled}
        // Nothing entered stays nothing: a stray tap must not count an uncounted leftover.
        onClick={() => value != null && onChange(Math.max(min, value - 1))}
      >
        <Minus />
      </Button>
      <Input
        {...{ [KEYPAD_FIELD]: '' }}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="next"
        aria-label={label}
        placeholder={placeholder}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => set(e.target.value)}
        onFocus={(e) => {
          e.target.select();
          setFocused(e.target);
        }}
        onBlur={() => setFocused(null)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (!focusNextField(e.currentTarget)) e.currentTarget.blur();
        }}
        className="h-11 min-w-0 flex-1 rounded-none border-0 text-center text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0"
      />
      <Button
        type="button"
        variant="ghost"
        className="size-11 shrink-0 rounded-none"
        aria-label={`Increase ${label}`}
        disabled={disabled}
        onClick={() => onChange(value == null ? Math.max(min, 1) : value + 1)}
      >
        <Plus />
      </Button>
      <KeypadBar input={focused} />
    </div>
  );
}
