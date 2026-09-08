import {
  DEFAULT_PAGE_SIZE,
  MAX_NOTES_LENGTH,
  MAX_PAGE_SIZE,
  MAX_UNITS,
  clampPageSize,
} from './inventory.constants';

describe('clampPageSize', () => {
  it('leaves a sensible page size alone', () => {
    expect(clampPageSize(50)).toBe(50);
  });

  it('caps a page size that would pull the whole table', () => {
    // `?limit=1000000` was accepted verbatim: ParseIntPipe validates the shape,
    // not the magnitude.
    expect(clampPageSize(1_000_000)).toBe(MAX_PAGE_SIZE);
  });

  it('refuses to page by zero or a negative count', () => {
    expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(-5)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('falls back to the default for a value that is not a number', () => {
    expect(clampPageSize(Number.NaN)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('unit and note bounds', () => {
  it('caps units well below the 32-bit ceiling the column has', () => {
    // A fat-fingered 999999999999 either landed or blew up as a Prisma int
    // overflow, which surfaces as a 500.
    expect(MAX_UNITS).toBeLessThan(2_147_483_647);
    expect(MAX_UNITS).toBeGreaterThan(10_000);
  });

  it('bounds free-text notes', () => {
    expect(MAX_NOTES_LENGTH).toBeGreaterThan(0);
  });
});
