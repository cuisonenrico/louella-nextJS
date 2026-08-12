import { computeAdjSum, computeSold } from './inventory-metrics.util';

describe('computeAdjSum', () => {
  it('returns 0 for no adjustments', () => {
    expect(computeAdjSum([])).toBe(0);
    expect(computeAdjSum(undefined)).toBe(0);
  });

  it('adds PULL_IN and subtracts everything else', () => {
    expect(
      computeAdjSum([
        { type: 'PULL_IN', value: 5 },
        { type: 'PULL_OUT', value: 3 },
        { type: 'ANOMALY', value: 2 },
      ]),
    ).toBe(0);
  });
});

describe('computeSold', () => {
  it('computes quantity + delivery + adjSum - leftover', () => {
    expect(
      computeSold({
        quantity: 100,
        delivery: 20,
        leftover: 10,
        adjustments: [],
      }),
    ).toBe(110);
  });

  it('folds adjustments into the result', () => {
    expect(
      computeSold({
        quantity: 50,
        delivery: 0,
        leftover: 10,
        adjustments: [{ type: 'PULL_OUT', value: 5 }],
      }),
    ).toBe(35);
  });

  it('subtracts rejects — spoiled units are never sold', () => {
    expect(
      computeSold({
        quantity: 100,
        delivery: 20,
        leftover: 10,
        reject: 8,
        adjustments: [],
      }),
    ).toBe(102);
  });

  it('treats a missing reject as 0', () => {
    expect(computeSold({ quantity: 30, delivery: 0, leftover: 5 })).toBe(25);
  });
});
