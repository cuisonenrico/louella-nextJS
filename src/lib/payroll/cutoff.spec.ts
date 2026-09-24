import { describe, expect, it } from 'vitest';
import {
  cutoffOf,
  cutoffsOfYear,
  currentCutoff,
  eachDate,
  formatCutoff,
  isCalendarDate,
  isPeriodStart,
  weekdayOf,
} from './cutoff';
import { peso, restDaysLabel } from './format';

describe('cutoffOf', () => {
  it('puts the 1st–15th in the first half', () => {
    expect(cutoffOf('2026-09-07')).toEqual({ periodStart: '2026-09-01', periodEnd: '2026-09-15', half: 1 });
    expect(cutoffOf('2026-09-15').periodStart).toBe('2026-09-01');
  });

  it('runs the second half to the last day of the month', () => {
    expect(cutoffOf('2026-09-16')).toEqual({ periodStart: '2026-09-16', periodEnd: '2026-09-30', half: 2 });
    expect(cutoffOf('2026-12-31').periodEnd).toBe('2026-12-31');
    expect(cutoffOf('2026-02-20').periodEnd).toBe('2026-02-28');
    expect(cutoffOf('2028-02-20').periodEnd).toBe('2028-02-29');
  });

  it('refuses a date that does not exist', () => {
    expect(() => cutoffOf('2026-02-30')).toThrow();
  });
});

describe('isCalendarDate / isPeriodStart', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isCalendarDate('2026-09-01')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-9-1')).toBe(false);
    expect(isCalendarDate('2026-09-01T00:00:00Z')).toBe(false);
  });

  it('accepts only the 1st and 16th as cutoff starts', () => {
    expect(isPeriodStart('2026-09-01')).toBe(true);
    expect(isPeriodStart('2026-09-16')).toBe(true);
    expect(isPeriodStart('2026-09-15')).toBe(false);
    expect(isPeriodStart('2026-13-01')).toBe(false);
  });
});

describe('currentCutoff', () => {
  // 16:30 UTC on the 15th is 00:30 on the 16th in Manila — the baking shift.
  it('reads the Manila day, not the UTC day', () => {
    expect(currentCutoff(new Date('2026-09-15T16:30:00Z')).periodStart).toBe('2026-09-16');
    expect(currentCutoff(new Date('2026-09-15T15:59:00Z')).periodStart).toBe('2026-09-01');
  });
});

describe('cutoffsOfYear', () => {
  it('lists 24 cutoffs in order', () => {
    const all = cutoffsOfYear(2026);
    expect(all).toHaveLength(24);
    expect(all[0].periodStart).toBe('2026-01-01');
    expect(all[23]).toEqual({ periodStart: '2026-12-16', periodEnd: '2026-12-31', half: 2 });
  });
});

describe('day helpers', () => {
  it('walks dates inclusively across a month end', () => {
    expect(eachDate('2026-02-27', '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']);
  });

  it('names weekdays with Sunday as 0', () => {
    expect(weekdayOf('2026-09-06')).toBe(0);
    expect(weekdayOf('2026-09-01')).toBe(2);
  });

  it('labels a cutoff', () => {
    expect(formatCutoff({ periodStart: '2026-09-01', periodEnd: '2026-09-15' })).toBe('Sep 1–15, 2026');
    expect(formatCutoff({ periodStart: '2026-02-16', periodEnd: '2026-02-28' })).toBe('Feb 16–28, 2026');
  });
});

describe('format', () => {
  it('formats pesos with two decimals', () => {
    expect(peso(7800)).toMatch(/7,800\.00/);
  });

  it('lists rest days by name', () => {
    expect(restDaysLabel([0, 3])).toBe('Sun, Wed');
    expect(restDaysLabel([])).toBe('None');
  });
});
