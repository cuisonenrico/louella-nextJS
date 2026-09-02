import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';
import { Textarea } from './textarea';

/**
 * iOS Safari zooms the viewport when a focused field's font-size is under 16px
 * and does not zoom back out. `text-base` is 16px; `md:text-sm` restores the
 * desktop size above the shell breakpoint. Asserted on the class string because
 * jsdom has no layout engine and cannot report a computed font size.
 */
describe('form controls avoid the iOS focus zoom', () => {
  it('renders inputs at 16px below md', () => {
    render(<Input aria-label="field" />);
    const cls = screen.getByLabelText('field').className;
    expect(cls).toContain('text-base');
    expect(cls).toContain('md:text-sm');
  });

  it('renders textareas at 16px below md', () => {
    render(<Textarea aria-label="notes" />);
    const cls = screen.getByLabelText('notes').className;
    expect(cls).toContain('text-base');
    expect(cls).toContain('md:text-sm');
  });

  it('gives inputs a 44px touch target below md', () => {
    render(<Input aria-label="field" />);
    const cls = screen.getByLabelText('field').className;
    expect(cls).toContain('h-11');
    expect(cls).toContain('md:h-10');
  });

  it('still lets a caller override the size', () => {
    render(<Input aria-label="field" className="h-8" />);
    // cn() runs tailwind-merge, so the later class must win outright rather
    // than both landing in the string and the cascade deciding.
    expect(screen.getByLabelText('field').className).not.toContain('h-11');
  });
});
