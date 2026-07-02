import { neighbor, parseQuantityText, sanitizeDecimalText, sanitizeQuantity } from './sheet';

describe('sanitizeQuantity', () => {
  it('parses a plain number', () => {
    expect(sanitizeQuantity('42')).toBe(42);
  });

  it('treats empty input as 0', () => {
    expect(sanitizeQuantity('')).toBe(0);
  });

  it('strips non-digit characters', () => {
    expect(sanitizeQuantity('1a2b3')).toBe(123);
  });

  it('blocks negatives (minus sign is stripped)', () => {
    expect(sanitizeQuantity('-5')).toBe(5);
  });

  it('truncates at the decimal point instead of merging digits', () => {
    expect(sanitizeQuantity('12.5')).toBe(12);
  });

  it('keeps pasted thousands separators intact', () => {
    expect(sanitizeQuantity('1,234')).toBe(1234);
  });

  it('returns 0 when no digits remain', () => {
    expect(sanitizeQuantity('abc')).toBe(0);
  });

  it('returns 0 for a bare decimal fraction', () => {
    expect(sanitizeQuantity('.5')).toBe(0);
  });
});

describe('sanitizeDecimalText', () => {
  it('keeps digits and a single dot', () => {
    expect(sanitizeDecimalText('12.5')).toBe('12.5');
  });

  it('preserves a trailing dot while typing', () => {
    expect(sanitizeDecimalText('12.')).toBe('12.');
  });

  it('collapses extra dots', () => {
    expect(sanitizeDecimalText('12..5.7')).toBe('12.57');
  });

  it('strips thousands separators and letters', () => {
    expect(sanitizeDecimalText('1,234.5kg')).toBe('1234.5');
  });

  it('blocks negatives', () => {
    expect(sanitizeDecimalText('-3.5')).toBe('3.5');
  });
});

describe('parseQuantityText', () => {
  it('parses a decimal', () => {
    expect(parseQuantityText('12.5')).toBe(12.5);
  });

  it('treats a trailing dot as the whole part', () => {
    expect(parseQuantityText('12.')).toBe(12);
  });

  it('treats empty and dot-only input as 0', () => {
    expect(parseQuantityText('')).toBe(0);
    expect(parseQuantityText('.')).toBe(0);
  });
});

describe('neighbor', () => {
  const list = [10, 20, 30];

  it('returns the next element', () => {
    expect(neighbor(list, 20, 1)).toBe(30);
  });

  it('returns the previous element', () => {
    expect(neighbor(list, 20, -1)).toBe(10);
  });

  it('stops at the end (no wrap-around)', () => {
    expect(neighbor(list, 30, 1)).toBeNull();
  });

  it('stops at the start (no wrap-around)', () => {
    expect(neighbor(list, 10, -1)).toBeNull();
  });

  it('returns null when current is not in the list', () => {
    expect(neighbor(list, 99, 1)).toBeNull();
  });

  it('works with string id lists (linear navigation)', () => {
    const ids = ['a-delivery', 'a-leftover', 'a-reject', 'b-delivery'];
    expect(neighbor(ids, 'a-reject', 1)).toBe('b-delivery');
    expect(neighbor(ids, 'a-delivery', -1)).toBeNull();
  });
});
