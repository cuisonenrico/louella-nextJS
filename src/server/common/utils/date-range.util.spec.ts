import { BadRequestException } from '@nestjs/common';
import {
  MAX_RANGE_DAYS,
  assertDateRange,
  eachDayInclusive,
  toUtcDay,
} from './date-range.util';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('assertDateRange', () => {
  it('accepts a single day', () => {
    expect(() =>
      assertDateRange(day('2026-09-08'), day('2026-09-08')),
    ).not.toThrow();
  });

  it('rejects an end date before the start date', () => {
    expect(() =>
      assertDateRange(day('2026-09-08'), day('2026-09-01')),
    ).toThrow(BadRequestException);
  });

  it('accepts the widest allowed window', () => {
    // maxDays counts calendar days inclusive, so 31 days is start + 30.
    expect(() =>
      assertDateRange(day('2026-09-01'), day('2026-10-01')),
    ).not.toThrow();
  });

  it('rejects one day beyond the window', () => {
    expect(() =>
      assertDateRange(day('2026-09-01'), day('2026-10-02')),
    ).toThrow(BadRequestException);
  });

  it('honours a wider limit for reports that ask for one', () => {
    expect(() =>
      assertDateRange(day('2026-09-01'), day('2026-10-02'), 90),
    ).not.toThrow();
  });

  it('names the limit it enforced', () => {
    expect(() =>
      assertDateRange(day('2026-09-01'), day('2026-12-31'), 90),
    ).toThrow(/90 days/);
  });

  it('defaults to the shared 31-day window', () => {
    expect(MAX_RANGE_DAYS).toBe(31);
  });
});

describe('eachDayInclusive', () => {
  it('includes both endpoints', () => {
    expect(
      eachDayInclusive(day('2026-09-06'), day('2026-09-08')).map((d) =>
        d.toISOString().slice(0, 10),
      ),
    ).toEqual(['2026-09-06', '2026-09-07', '2026-09-08']);
  });

  it('returns the single day when start equals end', () => {
    expect(eachDayInclusive(day('2026-09-08'), day('2026-09-08'))).toHaveLength(
      1,
    );
  });

  it('crosses a DST-less UTC month boundary without drifting', () => {
    const days = eachDayInclusive(day('2026-10-30'), day('2026-11-02'));
    expect(days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});

describe('toUtcDay', () => {
  it('maps a plain calendar date to UTC midnight', () => {
    expect(toUtcDay('2026-09-08').toISOString()).toBe(
      '2026-09-08T00:00:00.000Z',
    );
  });

  it('strips a time component instead of storing a mid-day instant', () => {
    // `@IsDateString()` accepts this, and `new Date(...)` used to carry the
    // time straight into the column. On MaterialInventory.date — a plain
    // DateTime — that produced a second card for the same day that
    // @@unique([materialId, date]) could not catch.
    expect(toUtcDay('2026-09-08T15:30:00.000Z').toISOString()).toBe(
      '2026-09-08T00:00:00.000Z',
    );
  });

  it('resolves an instant to the Manila calendar day, not the UTC one', () => {
    // 01:00 on the 8th in Manila is 17:00 on the 7th UTC. The bakery's day is
    // the Manila one — this is the same boundary localToday() uses.
    expect(toUtcDay('2026-09-08T01:00:00+08:00').toISOString()).toBe(
      '2026-09-08T00:00:00.000Z',
    );
  });

  it('passes a Date through by its Manila day', () => {
    expect(toUtcDay(new Date('2026-09-07T17:00:00.000Z')).toISOString()).toBe(
      '2026-09-08T00:00:00.000Z',
    );
  });

  it('rejects a string that is not a date at all', () => {
    expect(() => toUtcDay('not-a-date')).toThrow(BadRequestException);
  });
});
