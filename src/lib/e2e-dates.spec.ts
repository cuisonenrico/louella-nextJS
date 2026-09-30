import { afterEach, describe, expect, it, vi } from 'vitest';
import { cutoffBefore, previousCutoff, today, workingDays, yesterday } from '../../e2e/fixtures/dates';

afterEach(() => vi.useRealTimers());

describe('e2e dates', () => {
  it('uses the Manila day, not UTC, after 16:00 UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T16:30:00Z'));
    expect(today()).toBe('2026-09-19');
    expect(yesterday()).toBe('2026-09-18');
  });

  it('previous cutoff of a 16–end day is 1–15 of the same month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T02:00:00Z'));
    expect(previousCutoff()).toMatchObject({ periodStart: '2026-09-01', periodEnd: '2026-09-15', half: 1 });
  });

  it('previous cutoff of a 1–15 day is 16–end of the previous month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T02:00:00Z'));
    expect(previousCutoff()).toMatchObject({ periodStart: '2026-09-16', periodEnd: '2026-09-30', half: 2 });
  });

  it('cutoffBefore steps back one cutoff, so two ended cutoffs are always one of each half', () => {
    const second = { periodStart: '2026-09-16', periodEnd: '2026-09-30', half: 2 as const };
    expect(cutoffBefore(second)).toMatchObject({ periodStart: '2026-09-01', periodEnd: '2026-09-15', half: 1 });
    const first = { periodStart: '2026-09-01', periodEnd: '2026-09-15', half: 1 as const };
    expect(cutoffBefore(first)).toMatchObject({ periodStart: '2026-08-16', periodEnd: '2026-08-31', half: 2 });
  });

  it('workingDays drops rest days', () => {
    const days = workingDays({ periodStart: '2026-09-01', periodEnd: '2026-09-07', half: 1 }, [0]);
    expect(days).not.toContain('2026-09-06'); // Sunday
    expect(days).toHaveLength(6);
  });
});
