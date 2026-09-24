import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseAmount, parseCashCount } from './parseAmount';
import CashLineForm from './CashLineForm';

describe('parseAmount', () => {
  it.each([
    ['1,250.50', 1250.5],
    [' 850 ', 850],
    ['₱1,000', 1000],
    ['0.05', 0.05],
  ])('reads %p as %p', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });

  it.each(['', 'abc', '12.345', '-5', '0'])('rejects %p', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('parseCashCount', () => {
  it.each([
    ['0', 0],
    ['0.00', 0],
    ['₱0', 0],
    ['1,250.50', 1250.5],
  ])('reads %p as %p', (text, value) => {
    expect(parseCashCount(text)).toBe(value);
  });

  it.each(['', 'abc', '-1', '0.001'])('rejects %p', (text) => {
    expect(parseCashCount(text)).toBeNull();
  });
});

describe('CashLineForm', () => {
  const options = [
    { value: '2', label: 'Utilities' },
    { value: '5', label: 'Other', requiresNote: true },
  ];

  it('submits the picked option, the parsed amount and the note', async () => {
    const onSubmit = vi.fn();
    render(<CashLineForm pickLabel="Category" options={options} onSubmit={onSubmit} submitLabel="Add" />);
    await userEvent.selectOptions(screen.getByLabelText('Category'), '2');
    await userEvent.type(screen.getByLabelText('Amount'), '1,250.50');
    await userEvent.type(screen.getByLabelText('Note'), 'LPG');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledWith({ optionId: 2, amount: 1250.5, note: 'LPG' });
  });

  it('holds the button while a note is required but empty', async () => {
    const onSubmit = vi.fn();
    render(<CashLineForm pickLabel="Category" options={options} onSubmit={onSubmit} submitLabel="Add" />);
    await userEvent.selectOptions(screen.getByLabelText('Category'), '5');
    await userEvent.type(screen.getByLabelText('Amount'), '60');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('disables the button while a save is pending', () => {
    render(<CashLineForm pickLabel="Category" options={options} onSubmit={vi.fn()} submitLabel="Add" pending />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
