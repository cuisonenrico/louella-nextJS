import { applyAllSuggestions } from './applySuggestions';

describe('applyAllSuggestions', () => {
  it('fills rows whose current yield is 0', () => {
    const items = new Map([
      [1, 0],
      [2, 0],
    ]);
    const suggested = new Map([
      [1, 24],
      [2, 10],
    ]);

    const result = applyAllSuggestions(items, suggested);

    expect(result.get(1)).toBe(24);
    expect(result.get(2)).toBe(10);
  });

  it('never overwrites a non-zero yield the user typed', () => {
    const items = new Map([[1, 50]]);
    const suggested = new Map([[1, 24]]);

    const result = applyAllSuggestions(items, suggested);

    expect(result.get(1)).toBe(50);
  });

  it('leaves products without a suggestion untouched', () => {
    const items = new Map([
      [1, 0],
      [3, 0],
    ]);
    const suggested = new Map([[1, 24]]);

    const result = applyAllSuggestions(items, suggested);

    expect(result.get(1)).toBe(24);
    expect(result.get(3)).toBe(0);
  });

  it('returns a new Map and does not mutate the input', () => {
    const items = new Map([[1, 0]]);
    const suggested = new Map([[1, 24]]);

    const result = applyAllSuggestions(items, suggested);

    expect(result).not.toBe(items);
    expect(items.get(1)).toBe(0);
  });
});
