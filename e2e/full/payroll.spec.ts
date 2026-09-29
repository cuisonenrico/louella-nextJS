import { test, expect } from '../fixtures/test';
import { addDays, previousCutoff, workingDays } from '../fixtures/dates';
import { buildWorld, type World } from '../fixtures/world';
import { PayrollCutoffPage } from '../pages/payroll-cutoff.page';
import { PayslipPage } from '../pages/payslip.page';
import { money } from '../support/format';
import type { CutoffDetail } from '../support/types';

// One payroll run covers everyone in the cutoff, so this file runs serially and is not @stress.
test.describe.configure({ mode: 'serial' });

test.describe('payroll', () => {
  const cutoff = previousCutoff(); // already ended, so it can be finalized
  const RECURRING = 500;
  let world: World;
  let employeeName: string;
  let expectedNet: number;
  let runId: number;

  test.beforeAll(async ({ api }) => {
    // Leave no run behind: an earlier run of this file, or a failed one, may have finalized the cutoff.
    // `run` is only the active (non-voided) run.
    const existing = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    if (existing.run) await api.post(`/payroll/runs/${existing.run.id}/void`, { reason: 'e2e cleanup' });

    world = await buildWorld(api, {
      employees: 1,
      hireDate: addDays(cutoff.periodStart, -30),
      dailyRate: 600,
      restDays: [0],
      recurringDeduction: RECURRING,
    });
    const employee = world.employees[0];
    employeeName = `${employee.firstName} ${employee.lastName}`;

    const days = workingDays(cutoff, employee.restDays);
    const absentOn = days[0];
    const holidayOn = days[1];
    await api.post('/absences', { employeeId: employee.id, date: absentOn });

    // A rerun finds the holiday it made last time on the same date — reuse it. GET /payroll/holidays?year=YYYY
    const holidays = await api.get<Array<{ date: string; type: string; isClosed: boolean }>>('/payroll/holidays', {
      year: Number(cutoff.periodStart.slice(0, 4)),
    });
    if (!holidays.some((h) => h.date.slice(0, 10) === holidayOn && h.type === 'REGULAR' && !h.isClosed)) {
      await api.post('/payroll/holidays', { date: holidayOn, name: 'E2E Holiday', type: 'REGULAR' });
    }

    // pay = daily rate × days worked + holiday pay − deductions (compute-payslip.ts):
    //  - the absence costs a day; a worked holiday is paid rate × multiplier INSTEAD of its basic day;
    //  - recurring deductions are taken on the 1–15 cutoff only.
    const settings = await api.get<{ regularHolidayMultiplier: number }>('/payroll/settings');
    const workedDays = days.length - 1;
    const basic = employee.dailyRate * (workedDays - 1);
    const holidayPay = employee.dailyRate * settings.regularHolidayMultiplier;
    const deduction = cutoff.half === 1 ? RECURRING : 0;
    expectedNet = basic + holidayPay - deduction;
  });

  test('draft shows rate × days + holiday pay − deductions', async ({ page, api }) => {
    const employee = world.employees[0];
    // The API's draft (the one computePayslip) must agree with the rule computed above…
    const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    const draft = detail.draft!.payslips.find((s) => s.employeeId === employee.id)!;
    expect(draft.netPay).toBe(expectedNet);

    // …and the page must show it.
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    await expect(payroll.net(employeeName)).toHaveText(money(expectedNet));
  });

  test('finalize freezes the payslip at the draft figure', async ({ page, api }) => {
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    runId = await payroll.finalize(cutoff.periodStart);

    const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    const slip = detail.run!.payslips.find((s) => s.employeeId === world.employees[0].id)!;
    expect(slip.netPay).toBe(expectedNet);

    const payslip = new PayslipPage(page);
    await payslip.open(slip.id);
    await expect(payslip.net).toHaveText(money(expectedNet));
  });

  test('a finalized cutoff refuses a new absence', async ({ api }) => {
    const days = workingDays(cutoff, world.employees[0].restDays);
    const res = await api.raw('POST', '/absences', { employeeId: world.employees[0].id, date: days[2] });
    expect(res.status()).toBe(409);
    expect(await res.text()).toMatch(/is finalized/);
  });

  test('void, then finalize again', async ({ page }) => {
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    await payroll.voidRun('e2e: correcting the cutoff');
    const again = await payroll.finalize(cutoff.periodStart);
    expect(again).not.toBe(runId); // a fresh run; the voided one is kept on record
    await payroll.voidRun('e2e: leave the cutoff open'); // so the next run of this file starts clean
  });
});
