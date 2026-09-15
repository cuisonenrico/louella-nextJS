import { clampPage, clampPageSize, MAX_PAGE_SIZE } from './pagination.util';

describe('clampPageSize', () => {
  it('passes through a sensible size', () => {
    expect(clampPageSize(50)).toBe(50);
  });

  it('caps an oversized request', () => {
    expect(clampPageSize(10_000_000)).toBe(MAX_PAGE_SIZE);
  });

  it.each([0, -5, Number.NaN])('raises %p to 1', (value) => {
    expect(clampPageSize(value)).toBe(1);
  });
});

describe('clampPage', () => {
  it('passes through a positive page', () => {
    expect(clampPage(3)).toBe(3);
  });

  it.each([0, -2, Number.NaN])('raises %p to 1, never a negative skip', (value) => {
    expect(clampPage(value)).toBe(1);
  });
});
