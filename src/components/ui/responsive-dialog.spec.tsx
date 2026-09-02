import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { installMatchMedia } from '@/test/matchMedia';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
} from './responsive-dialog';

function open(mobile: boolean) {
  installMatchMedia(mobile);
  render(
    <ResponsiveDialog open>
      <ResponsiveDialogContent>
        <ResponsiveDialogTitle>Add adjustment</ResponsiveDialogTitle>
        <p>body</p>
        <ResponsiveDialogFooter>
          <button type="button">Save</button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
  return screen.getByRole('dialog');
}

describe('ResponsiveDialog', () => {
  it('renders a centred dialog above the breakpoint', () => {
    // The desktop Dialog is the one that translates itself to the centre.
    expect(open(false).className).toContain('translate-x-[-50%]');
  });

  it('renders a bottom sheet below it', () => {
    const panel = open(true);
    expect(panel.className).toContain('bottom-0');
    expect(panel.className).not.toContain('translate-x-[-50%]');
  });

  it('always exposes an accessible name', () => {
    expect(open(false)).toHaveAccessibleName('Add adjustment');
    expect(open(true)).toHaveAccessibleName('Add adjustment');
  });

  it('caps the sheet height and scrolls its body', () => {
    const panel = open(true);
    expect(panel.className).toContain('max-h-[85dvh]');
    expect(panel.className).toContain('overflow-y-auto');
  });

  it('clears the home indicator', () => {
    expect(open(true).className).toContain('pb-safe');
  });

  it('puts the primary action under the thumb without reordering the DOM', () => {
    // flex-col-reverse flips the visual order only, so tab order still follows
    // the source and the primary action stays last in the DOM.
    open(true);
    expect(screen.getByTestId('responsive-dialog-footer').className).toContain(
      'flex-col-reverse'
    );
  });
});
