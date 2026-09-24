import { computeCashDay, type CashDayInput } from './compute-cash-day';

function input(overrides: Partial<CashDayInput> = {}): CashDayInput {
  return {
    sales: 12450,
    expenseAmounts: [850],
    valeAmounts: [500],
    actualCash: 11050,
    snapshot: null,
    ...overrides,
  };
}

describe('computeCashDay', () => {
  it('computes expected cash and a shortage (the spec example)', () => {
    expect(computeCashDay(input())).toEqual({
      sales: 12450,
      expenses: 850,
      vale: 500,
      expected: 11100,
      actualCash: 11050,
      overShort: -50,
      state: 'SHORT',
      drift: [],
    });
  });

  it('reports over and balanced', () => {
    expect(computeCashDay(input({ actualCash: 11100 })).state).toBe('BALANCED');
    const over = computeCashDay(input({ actualCash: 11120.5 }));
    expect(over).toMatchObject({ overShort: 20.5, state: 'OVER' });
  });

  it('is NOT_COUNTED with no over/short until cash is entered', () => {
    expect(computeCashDay(input({ actualCash: null }))).toMatchObject({
      actualCash: null,
      overShort: null,
      state: 'NOT_COUNTED',
      expected: 11100,
    });
  });

  it('adds in centavos, so 0.1 + 0.2 is exactly 0.3', () => {
    const t = computeCashDay(input({ sales: 0.3, expenseAmounts: [0.1, 0.2], valeAmounts: [], actualCash: 0 }));
    expect(t).toMatchObject({ expenses: 0.3, expected: 0, overShort: 0, state: 'BALANCED' });
  });

  it('allows a negative expected figure when spending exceeds sales', () => {
    const t = computeCashDay(input({ sales: 100, expenseAmounts: [300], valeAmounts: [], actualCash: 0 }));
    expect(t).toMatchObject({ expected: -200, overShort: 200, state: 'OVER' });
  });

  it('flags only the figures that moved since verification', () => {
    const snapshot = { sales: 12450, expenses: 850, vale: 500 };
    expect(computeCashDay(input({ snapshot })).drift).toEqual([]);
    expect(computeCashDay(input({ sales: 12510, snapshot })).drift).toEqual([
      { field: 'sales', atVerify: 12450, now: 12510 },
    ]);
  });
});
