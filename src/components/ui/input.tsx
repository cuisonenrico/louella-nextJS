import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      // `text-base md:text-sm`: 16px is the threshold under which iOS Safari
      // zooms the viewport on focus and does not restore it, so every form in
      // the app is affected. `h-11` below md is the 44px touch target
      // (WCAG 2.5.5 / Apple HIG) — a 16px font in an h-10 box is cramped.
      // Desktop keeps the original h-10/14px look exactly.
      className={cn(
        'flex h-11 md:h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
