import { csvField } from './csv.util';

describe('csvField', () => {
  it('quotes a plain value', () => {
    expect(csvField('Sourdough Loaf')).toBe('"Sourdough Loaf"');
  });

  it('doubles embedded quotes', () => {
    expect(csvField('12" Cake')).toBe('"12"" Cake"');
  });

  it.each(['=cmd|calc', '+1+1', '-1+1', '@SUM(A1)'])(
    'neutralizes formula-triggering leading characters: %s',
    (payload) => {
      const result = csvField(payload);
      expect(result.startsWith(`"'${payload[0]}`)).toBe(true);
    },
  );

  it('passes through numbers', () => {
    expect(csvField(42)).toBe('"42"');
  });
});
