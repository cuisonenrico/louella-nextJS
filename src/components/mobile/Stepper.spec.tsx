import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './Stepper';

function setup(value: number | null) {
  const onChange = vi.fn();
  render(<Stepper label="Leftover" value={value} onChange={onChange} />);
  return { onChange, input: screen.getByRole('textbox', { name: 'Leftover' }) };
}

describe('Stepper', () => {
  it.each([
    ['-3', 3],
    ['1e3', 13],
    ['07', 7],
    ['12 pcs', 12],
  ])('keeps digits only: %s → %s', (typed, expected) => {
    const { onChange, input } = setup(null);
    fireEvent.change(input, { target: { value: typed } });
    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it('clearing the input means no value, not zero', () => {
    const { onChange, input } = setup(5);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('decrease stops at zero', async () => {
    const { onChange } = setup(0);
    await userEvent.click(screen.getByRole('button', { name: 'Decrease Leftover' }));
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('increase from empty starts at one', async () => {
    const { onChange } = setup(null);
    await userEvent.click(screen.getByRole('button', { name: 'Increase Leftover' }));
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('shows the placeholder when empty', () => {
    const { input } = setup(null);
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('placeholder', '–');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });
});
