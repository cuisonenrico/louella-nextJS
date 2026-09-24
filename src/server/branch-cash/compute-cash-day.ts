import { centavos, pesos } from '../common/utils/decimal.util';

/**
 * The bottom of the paper inventory sheet, computed.
 *
 *   expected  = sales − expenses − vale
 *   overShort = actual cash − expected   (null until the cash is counted)
 *
 * Pure and exact: every figure is added in whole centavos. The day view and the
 * period summary both call this, so they cannot disagree.
 */

export type CashDayState = 'NOT_COUNTED' | 'BALANCED' | 'OVER' | 'SHORT';
export type DriftField = 'sales' | 'expenses' | 'vale';

export interface CashSnapshot {
  sales: number;
  expenses: number;
  vale: number;
}

export interface CashDayInput {
  sales: number;
  expenseAmounts: number[];
  valeAmounts: number[];
  actualCash: number | null;
  /** The figures frozen at verification; null for an open day. */
  snapshot: CashSnapshot | null;
}

export interface CashDayTotals {
  sales: number;
  expenses: number;
  vale: number;
  expected: number;
  actualCash: number | null;
  overShort: number | null;
  state: CashDayState;
  drift: { field: DriftField; atVerify: number; now: number }[];
}

const sum = (amounts: number[]) => amounts.reduce((s, a) => s + centavos(a), 0);

export function computeCashDay(input: CashDayInput): CashDayTotals {
  const live = {
    sales: centavos(input.sales),
    expenses: sum(input.expenseAmounts),
    vale: sum(input.valeAmounts),
  };
  const expected = live.sales - live.expenses - live.vale;
  const actual = input.actualCash == null ? null : centavos(input.actualCash);
  const overShort = actual == null ? null : actual - expected;
  const state: CashDayState =
    overShort == null ? 'NOT_COUNTED' : overShort === 0 ? 'BALANCED' : overShort > 0 ? 'OVER' : 'SHORT';

  const drift: CashDayTotals['drift'] = [];
  if (input.snapshot) {
    for (const field of ['sales', 'expenses', 'vale'] as const) {
      const atVerify = centavos(input.snapshot[field]);
      if (atVerify !== live[field]) drift.push({ field, atVerify: pesos(atVerify), now: pesos(live[field]) });
    }
  }

  return {
    sales: pesos(live.sales),
    expenses: pesos(live.expenses),
    vale: pesos(live.vale),
    expected: pesos(expected),
    actualCash: actual == null ? null : pesos(actual),
    overShort: overShort == null ? null : pesos(overShort),
    state,
    drift,
  };
}
