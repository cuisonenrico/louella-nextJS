import { getEffectivePrice } from './price-history.util';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('getEffectivePrice', () => {
  const history = new Map([
    [
      1,
      [
        { price: 10, effectiveAt: day('2026-09-01') },
        { price: 12, effectiveAt: day('2026-09-10') },
      ],
    ],
  ]);

  it('uses the latest price on or before the date', () => {
    expect(getEffectivePrice(1, day('2026-09-05'), 99, history)).toBe(10);
    expect(getEffectivePrice(1, day('2026-09-10'), 99, history)).toBe(12);
    expect(getEffectivePrice(1, day('2026-09-20'), 99, history)).toBe(12);
  });

  // The old fallback returned the current price (99 here) for any date before
  // the first entry, revaluing every earlier sale at today's price.
  it('uses the earliest recorded price, not the current one, before the first entry', () => {
    expect(getEffectivePrice(1, day('2026-08-15'), 99, history)).toBe(10);
  });

  it('uses the current price only when the product has no history at all', () => {
    expect(getEffectivePrice(2, day('2026-08-15'), 99, history)).toBe(99);
  });

  it('lets the later of two same-day entries win (callers order by effectiveAt, id)', () => {
    const sameDay = new Map([
      [
        1,
        [
          { price: 10, effectiveAt: day('2026-09-01') },
          { price: 11, effectiveAt: day('2026-09-01') },
        ],
      ],
    ]);
    expect(getEffectivePrice(1, day('2026-09-01'), 99, sameDay)).toBe(11);
  });
});
