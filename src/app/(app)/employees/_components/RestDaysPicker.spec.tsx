import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RestDaysPicker } from './RestDaysPicker';

describe('RestDaysPicker', () => {
  it('adds a day and keeps the list sorted', () => {
    const onChange = vi.fn();
    render(<RestDaysPicker value={[3]} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sun' }));
    expect(onChange).toHaveBeenCalledWith([0, 3]);
  });

  it('refuses to make all seven days rest days', () => {
    const onChange = vi.fn();
    render(<RestDaysPicker value={[0, 1, 2, 3, 4, 5]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Sat' })).toBeDisabled();
  });
});
