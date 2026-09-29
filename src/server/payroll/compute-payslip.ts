import { eachDate, weekdayOf, type Cutoff } from '@/lib/payroll/cutoff';
import { centavos, pesos, scaleCentavos } from '../common/utils/decimal.util';

/**
 * One employee's pay for one cutoff. Pure: no database, no clock.
 *
 * The live draft and finalize both call this, so what the admin reviews is
 * exactly what gets frozen. Money is added in integer centavos and converted
 * back to pesos once per figure.
 */

export type AdjustmentKind = 'ADDITION' | 'DEDUCTION';
export type LineType = 'BASIC' | 'HOLIDAY' | 'ADDITION' | 'DEDUCTION' | 'EMPLOYER_SHARE';
export type LineSource = 'EmployeeRate' | 'Holiday' | 'PayrollAdjustment' | 'RecurringDeduction' | 'BranchVale';
export type HolidayType = 'REGULAR' | 'SPECIAL';

export interface EmploymentInput {
  id: number;
  restDays: number[];
  hiredOn: string;
  separatedOn: string | null;
}

export interface RateInput {
  id: number;
  dailyRate: number;
  effectiveOn: string;
}

export interface AdjustmentInput {
  id: number;
  kind: AdjustmentKind;
  category: string;
  description: string;
  amount: number;
}

/** A cash advance taken from a branch drawer (BranchVale), dated inside the cutoff. */
export interface ValeInput { id: number; date: string; branchName: string; amount: number }

export interface RecurringInput {
  id: number;
  name: string;
  employeeShare: number;
  employerShare: number;
}

/** A live holiday dated inside the cutoff. */
export interface HolidayInput {
  id: number;
  date: string;
  name: string;
  type: HolidayType;
  /** The bakery did not operate: nobody scheduled that day is paid for it. */
  isClosed: boolean;
}

export interface HolidayMultipliers {
  regular: number;
  special: number;
}

export interface PayslipInput {
  employee: EmploymentInput;
  cutoff: Cutoff;
  rates: RateInput[];
  absences: string[];
  adjustments: AdjustmentInput[];
  vale: ValeInput[];
  /** Active recurring deductions only. */
  recurring: RecurringInput[];
  skippedRecurringIds: number[];
  holidays: HolidayInput[];
  /** Holidays this employee worked although it was their rest day. */
  restDayWorkHolidayIds: number[];
  multipliers: HolidayMultipliers;
}

export interface ComputedLine {
  type: LineType;
  label: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
  sourceType: LineSource | null;
  sourceId: number | null;
}

export type PayslipWarning =
  | { code: 'MISSING_RATE'; blocking: true; dates: string[] }
  | { code: 'IGNORED_REST_DAY_MARK'; blocking: false; dates: string[] }
  | { code: 'NEGATIVE_NET'; blocking: false }
  | { code: 'NO_DAYS_WORKED'; blocking: false };

export interface ComputedPayslip {
  employeeId: number;
  workingDays: number;
  absenceDays: number;
  daysWorked: number;
  basicPay: number;
  holidayPay: number;
  totalAdditions: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerShare: number;
  lines: ComputedLine[];
  warnings: PayslipWarning[];
}

/** The part of the cutoff the employee was employed for, or null. */
export function employmentWindow(
  employee: Pick<EmploymentInput, 'hiredOn' | 'separatedOn'>,
  cutoff: Pick<Cutoff, 'periodStart' | 'periodEnd'>,
): { start: string; end: string } | null {
  const start = employee.hiredOn > cutoff.periodStart ? employee.hiredOn : cutoff.periodStart;
  const end =
    employee.separatedOn !== null && employee.separatedOn < cutoff.periodEnd
      ? employee.separatedOn
      : cutoff.periodEnd;
  return start <= end ? { start, end } : null;
}

/** The latest rate effective on or before `date`; `rates` sorted ascending. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-03` → `Sep 3`. String arithmetic: no Date, no time zone. */
function shortDate(date: string): string {
  const [, month, dayOfMonth] = date.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(dayOfMonth)}`;
}

function rateOn(rates: RateInput[], date: string): RateInput | null {
  let found: RateInput | null = null;
  for (const rate of rates) {
    if (rate.effectiveOn > date) break;
    found = rate;
  }
  return found;
}

export function computePayslip(input: PayslipInput): ComputedPayslip {
  const { employee, cutoff } = input;

  // 1–3. Working days, absences, days worked. A closed holiday is a scheduled
  // day nobody worked, so it counts like an absence.
  const window = employmentWindow(employee, cutoff);
  const restDays = new Set(employee.restDays);
  const isRestDay = (d: string) => restDays.has(weekdayOf(d));
  const holidayOn = new Map(input.holidays.map((h) => [h.date, h]));
  const allDates = window ? eachDate(window.start, window.end) : [];
  const workingDates = allDates.filter((d) => !isRestDay(d));
  const absent = new Set(input.absences);
  const worked = workingDates.filter((d) => !absent.has(d) && !holidayOn.get(d)?.isClosed);
  const workedSet = new Set(worked);

  // Holidays: worked → the type's multiplier; rest day not worked → 1.00;
  // scheduled but absent or closed → nothing.
  const marked = new Set(input.restDayWorkHolidayIds);
  const holidayDays: { holiday: HolidayInput; multiplier: number; suffix: string }[] = [];
  const ignoredMarks: string[] = [];
  let restDaysWorked = 0;
  for (const date of allDates) {
    const holiday = holidayOn.get(date);
    if (!holiday) continue;
    const multiplier = holiday.type === 'REGULAR' ? input.multipliers.regular : input.multipliers.special;
    if (isRestDay(date)) {
      if (marked.has(holiday.id) && !holiday.isClosed) {
        holidayDays.push({ holiday, multiplier, suffix: 'rest day, worked' });
        restDaysWorked += 1;
      } else {
        holidayDays.push({ holiday, multiplier: 1, suffix: 'rest day' });
      }
    } else {
      if (marked.has(holiday.id)) ignoredMarks.push(date);
      if (workedSet.has(date)) holidayDays.push({ holiday, multiplier, suffix: 'worked' });
    }
  }

  // 4. Basic pay for ordinary worked days: consecutive days at the same rate
  // collapse into one line.
  const rates = [...input.rates].sort((a, b) => a.effectiveOn.localeCompare(b.effectiveOn));
  const segments: { rate: RateInput; days: number }[] = [];
  const missingRate: string[] = [];
  for (const date of worked) {
    if (holidayOn.has(date)) continue;
    const rate = rateOn(rates, date);
    if (!rate) {
      missingRate.push(date);
      continue;
    }
    const last = segments[segments.length - 1];
    if (last && last.rate.id === rate.id) last.days += 1;
    else segments.push({ rate, days: 1 });
  }

  const lines: ComputedLine[] = [];
  let basic = 0;
  for (const { rate, days } of segments) {
    const cents = centavos(rate.dailyRate) * days;
    basic += cents;
    lines.push({
      type: 'BASIC',
      label: 'Basic pay',
      quantity: days,
      rate: rate.dailyRate,
      amount: pesos(cents),
      sourceType: 'EmployeeRate',
      sourceId: rate.id,
    });
  }

  // 4b. One line per paid holiday, by date. The multiplier is kept as the
  // line's quantity so a finalized payslip shows the rate it used.
  let holidayPay = 0;
  for (const { holiday, multiplier, suffix } of holidayDays) {
    const rate = rateOn(rates, holiday.date);
    if (!rate) {
      missingRate.push(holiday.date);
      continue;
    }
    const cents = scaleCentavos(centavos(rate.dailyRate), multiplier);
    holidayPay += cents;
    lines.push({
      type: 'HOLIDAY',
      label: `${holiday.type === 'REGULAR' ? 'Regular' : 'Special'} holiday — ${shortDate(holiday.date)} (${suffix})`,
      quantity: multiplier,
      rate: rate.dailyRate,
      amount: pesos(cents),
      sourceType: 'Holiday',
      sourceId: holiday.id,
    });
  }
  missingRate.sort();

  // 5. One-off additions.
  let additions = 0;
  for (const adj of input.adjustments.filter((a) => a.kind === 'ADDITION')) {
    const cents = centavos(adj.amount);
    additions += cents;
    lines.push(adjustmentLine('ADDITION', adj, cents));
  }

  // 6–7. Deductions: recurring (1–15 cutoff only), then one-off. Employer
  // shares are recorded after, and never touch net pay.
  let deductions = 0;
  let employerShare = 0;
  let recurringApplied = 0;
  const employerLines: ComputedLine[] = [];
  if (cutoff.half === 1) {
    const skipped = new Set(input.skippedRecurringIds);
    for (const r of input.recurring.filter((r) => !skipped.has(r.id))) {
      const own = centavos(r.employeeShare);
      if (own > 0) {
        deductions += own;
        recurringApplied += 1;
        lines.push({
          type: 'DEDUCTION',
          label: r.name,
          quantity: null,
          rate: null,
          amount: pesos(own),
          sourceType: 'RecurringDeduction',
          sourceId: r.id,
        });
      }
      const employer = centavos(r.employerShare);
      if (employer > 0) {
        employerShare += employer;
        employerLines.push({
          type: 'EMPLOYER_SHARE',
          label: `${r.name} (employer share)`,
          quantity: null,
          rate: null,
          amount: pesos(employer),
          sourceType: 'RecurringDeduction',
          sourceId: r.id,
        });
      }
    }
  }
  for (const adj of input.adjustments.filter((a) => a.kind === 'DEDUCTION')) {
    const cents = centavos(adj.amount);
    deductions += cents;
    lines.push(adjustmentLine('DEDUCTION', adj, cents));
  }
  // Vale taken from a branch drawer during the cutoff. Read from BranchVale,
  // never copied into adjustments, so the payslip and the drawer agree.
  for (const v of [...input.vale].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    const cents = centavos(v.amount);
    deductions += cents;
    lines.push({
      type: 'DEDUCTION',
      label: `Vale — ${v.branchName}, ${shortDate(v.date)}`,
      quantity: null,
      rate: null,
      amount: pesos(cents),
      sourceType: 'BranchVale',
      sourceId: v.id,
    });
  }
  lines.push(...employerLines);

  // 8. Net pay.
  const net = basic + holidayPay + additions - deductions;
  const daysWorked = worked.length + restDaysWorked;

  const warnings: PayslipWarning[] = [];
  if (missingRate.length > 0) warnings.push({ code: 'MISSING_RATE', blocking: true, dates: missingRate });
  if (ignoredMarks.length > 0) warnings.push({ code: 'IGNORED_REST_DAY_MARK', blocking: false, dates: ignoredMarks });
  if (net < 0) warnings.push({ code: 'NEGATIVE_NET', blocking: false });
  if (daysWorked === 0 && recurringApplied > 0) warnings.push({ code: 'NO_DAYS_WORKED', blocking: false });

  return {
    employeeId: employee.id,
    workingDays: workingDates.length,
    absenceDays: workingDates.length - worked.length,
    daysWorked,
    basicPay: pesos(basic),
    holidayPay: pesos(holidayPay),
    totalAdditions: pesos(additions),
    totalDeductions: pesos(deductions),
    netPay: pesos(net),
    totalEmployerShare: pesos(employerShare),
    lines,
    warnings,
  };
}

function adjustmentLine(type: 'ADDITION' | 'DEDUCTION', adj: AdjustmentInput, cents: number): ComputedLine {
  return {
    type,
    label: adj.description,
    quantity: null,
    rate: null,
    amount: pesos(cents),
    sourceType: 'PayrollAdjustment',
    sourceId: adj.id,
  };
}
