import { addDays, manilaToday } from './manilaDate';

describe('manilaToday', () => {
  it('returns the Manila date during the early shift, when UTC is still on yesterday', () => {
    // 2026-09-18 22:30 UTC is 2026-09-19 06:30 in Manila.
    expect(manilaToday(new Date('2026-09-18T22:30:00Z'))).toBe('2026-09-19');
  });

  it('agrees with UTC once both are past midnight', () => {
    // 2026-09-19 10:00 UTC is 18:00 in Manila, same calendar day.
    expect(manilaToday(new Date('2026-09-19T10:00:00Z'))).toBe('2026-09-19');
  });

  it('rolls over exactly at Manila midnight (16:00 UTC)', () => {
    expect(manilaToday(new Date('2026-09-18T15:59:59Z'))).toBe('2026-09-18');
    expect(manilaToday(new Date('2026-09-18T16:00:00Z'))).toBe('2026-09-19');
  });
});

describe('addDays', () => {
  it('moves forward and back across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
});
