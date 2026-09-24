import { cutoffOf } from '@/lib/payroll/cutoff';
import { computePayslip, employmentWindow, type PayslipInput } from './compute-payslip';

const FIRST_HALF = cutoffOf('2026-09-01'); // Sep 1–15, 13 working days with Sunday rest
const SECOND_HALF = cutoffOf('2026-09-16'); // Sep 16–30, 13 working days

function input(overrides: Partial<PayslipInput> = {}): PayslipInput {
  return {
    employee: { id: 1, restDays: [0], hiredOn: '2026-01-01', separatedOn: null },
    cutoff: FIRST_HALF,
    rates: [{ id: 10, dailyRate: 600, effectiveOn: '2026-01-01' }],
    absences: [],
    adjustments: [],
    recurring: [],
    skippedRecurringIds: [],
    ...overrides,
  };
}

const SSS = { id: 31, name: 'SSS', employeeShare: 450, employerShare: 950 };
const PHILHEALTH = { id: 32, name: 'PhilHealth', employeeShare: 250, employerShare: 250 };

describe('computePayslip', () => {
  it('pays the daily rate for every working day', () => {
    const slip = computePayslip(input());
    expect(slip).toMatchObject({ workingDays: 13, absenceDays: 0, daysWorked: 13, basicPay: 7800, netPay: 7800 });
    expect(slip.lines).toEqual([
      { type: 'BASIC', label: 'Basic pay', quantity: 13, rate: 600, amount: 7800, sourceType: 'EmployeeRate', sourceId: 10 },
    ]);
    expect(slip.warnings).toEqual([]);
  });

  it('subtracts absences, ignoring any recorded on a rest day', () => {
    const slip = computePayslip(input({ absences: ['2026-09-02', '2026-09-03', '2026-09-06'] }));
    expect(slip).toMatchObject({ workingDays: 13, absenceDays: 2, daysWorked: 11, basicPay: 6600 });
  });

  it('honours several rest days a week', () => {
    const slip = computePayslip(input({ employee: { id: 1, restDays: [0, 3], hiredOn: '2026-01-01', separatedOn: null } }));
    expect(slip.workingDays).toBe(11); // Wednesdays Sep 2 and 9 are off too
  });

  it('handles a short second half', () => {
    const slip = computePayslip(input({ cutoff: cutoffOf('2026-02-16') }));
    expect(slip.workingDays).toBe(12);
  });

  it('clips the cutoff to the hire and separation dates', () => {
    const hired = computePayslip(input({ employee: { id: 1, restDays: [0], hiredOn: '2026-09-10', separatedOn: null } }));
    expect(hired.workingDays).toBe(5); // Sep 10–15 without Sunday the 13th

    const separated = computePayslip(input({ employee: { id: 1, restDays: [0], hiredOn: '2026-01-01', separatedOn: '2026-09-04' } }));
    expect(separated.workingDays).toBe(4);
  });

  it('splits basic pay when the rate changes mid-cutoff', () => {
    const slip = computePayslip(
      input({
        rates: [
          { id: 11, dailyRate: 650, effectiveOn: '2026-09-08' },
          { id: 10, dailyRate: 600, effectiveOn: '2026-01-01' },
        ],
      }),
    );
    expect(slip.lines.filter((l) => l.type === 'BASIC')).toEqual([
      { type: 'BASIC', label: 'Basic pay', quantity: 6, rate: 600, amount: 3600, sourceType: 'EmployeeRate', sourceId: 10 },
      { type: 'BASIC', label: 'Basic pay', quantity: 7, rate: 650, amount: 4550, sourceType: 'EmployeeRate', sourceId: 11 },
    ]);
    expect(slip.basicPay).toBe(8150);
  });

  it('takes recurring deductions and records employer shares on the 1–15 cutoff only', () => {
    const first = computePayslip(input({ recurring: [SSS, PHILHEALTH] }));
    expect(first).toMatchObject({ totalDeductions: 700, totalEmployerShare: 1200, netPay: 7100 });
    expect(first.lines.map((l) => [l.type, l.label])).toEqual([
      ['BASIC', 'Basic pay'],
      ['DEDUCTION', 'SSS'],
      ['DEDUCTION', 'PhilHealth'],
      ['EMPLOYER_SHARE', 'SSS (employer share)'],
      ['EMPLOYER_SHARE', 'PhilHealth (employer share)'],
    ]);

    const second = computePayslip(input({ cutoff: SECOND_HALF, recurring: [SSS, PHILHEALTH] }));
    expect(second).toMatchObject({ totalDeductions: 0, totalEmployerShare: 0, netPay: 7800 });
  });

  it('drops exactly the skipped deduction and its employer share', () => {
    const slip = computePayslip(input({ recurring: [SSS, PHILHEALTH], skippedRecurringIds: [31] }));
    expect(slip).toMatchObject({ totalDeductions: 250, totalEmployerShare: 250 });
  });

  it('adds one-off additions and subtracts one-off deductions', () => {
    const slip = computePayslip(
      input({
        adjustments: [
          { id: 1, kind: 'ADDITION', category: 'OVERTIME', description: 'Overtime Sep 5', amount: 500 },
          { id: 2, kind: 'DEDUCTION', category: 'OFFENSE', description: 'Late 3x', amount: 200 },
        ],
      }),
    );
    expect(slip).toMatchObject({ totalAdditions: 500, totalDeductions: 200, netPay: 8100 });
    expect(slip.lines.find((l) => l.sourceId === 2)).toMatchObject({
      type: 'DEDUCTION',
      label: 'Late 3x',
      sourceType: 'PayrollAdjustment',
    });
  });

  it('warns without blocking when net pay is negative', () => {
    const slip = computePayslip(
      input({ adjustments: [{ id: 3, kind: 'DEDUCTION', category: 'OTHER', description: 'Cash advance', amount: 9000 }] }),
    );
    expect(slip.netPay).toBe(-1200);
    expect(slip.warnings).toEqual([{ code: 'NEGATIVE_NET', blocking: false }]);
  });

  it('blocks when a worked day has no rate, listing the days', () => {
    const slip = computePayslip(input({ rates: [{ id: 11, dailyRate: 600, effectiveOn: '2026-09-08' }] }));
    expect(slip.basicPay).toBe(4200);
    expect(slip.warnings).toEqual([
      {
        code: 'MISSING_RATE',
        blocking: true,
        dates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-07'],
      },
    ]);
  });

  it('warns when recurring deductions fall on a cutoff with no days worked', () => {
    const allAbsent = ['01', '02', '03', '04', '05', '07', '08', '09', '10', '11', '12', '14', '15'].map((d) => `2026-09-${d}`);
    const slip = computePayslip(input({ absences: allAbsent, recurring: [SSS] }));
    expect(slip.daysWorked).toBe(0);
    expect(slip.warnings).toEqual([
      { code: 'NEGATIVE_NET', blocking: false },
      { code: 'NO_DAYS_WORKED', blocking: false },
    ]);
  });

  it('adds money in centavos, without float drift', () => {
    const slip = computePayslip(
      input({
        rates: [{ id: 10, dailyRate: 537.33, effectiveOn: '2026-01-01' }],
        adjustments: [
          { id: 1, kind: 'ADDITION', category: 'ALLOWANCE', description: 'a', amount: 0.1 },
          { id: 2, kind: 'ADDITION', category: 'ALLOWANCE', description: 'b', amount: 0.2 },
        ],
      }),
    );
    expect(slip.basicPay).toBe(6985.29);
    expect(slip.totalAdditions).toBe(0.3);
    expect(slip.netPay).toBe(6985.59);
  });
});

describe('employmentWindow', () => {
  it('is null when employment does not touch the cutoff', () => {
    expect(employmentWindow({ hiredOn: '2026-09-16', separatedOn: null }, FIRST_HALF)).toBeNull();
    expect(employmentWindow({ hiredOn: '2026-01-01', separatedOn: '2026-08-31' }, FIRST_HALF)).toBeNull();
  });

  it('clips to the overlap', () => {
    expect(employmentWindow({ hiredOn: '2026-09-10', separatedOn: '2026-09-12' }, FIRST_HALF)).toEqual({
      start: '2026-09-10',
      end: '2026-09-12',
    });
  });
});
