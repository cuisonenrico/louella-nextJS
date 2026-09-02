import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('DialogContent fits a phone screen', () => {
  function open() {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit</DialogTitle>
          <p>body</p>
        </DialogContent>
      </Dialog>
    );
    return screen.getByRole('dialog');
  }

  it('caps its height against the dynamic viewport', () => {
    // `dvh`, not `vh`: vh is the large viewport, so a 90vh dialog is taller
    // than the screen while the mobile browser chrome is showing.
    expect(open().className).toContain('max-h-[90dvh]');
  });

  it('scrolls its own overflow rather than clipping it', () => {
    expect(open().className).toContain('overflow-y-auto');
  });

  it('leaves a gutter on a narrow screen', () => {
    // `max-w-lg` alone lets the panel touch both edges at 390px.
    expect(open().className).toMatch(/w-\[calc\(100%-2rem\)\]/);
  });
});
