import { test, expect } from '../fixtures/test';
import { addDays, cutoffBefore, previousCutoff, workingDays, type Cutoff } from '../fixtures/dates';
import { buildWorld, type World } from '../fixtures/world';
import { PayrollCutoffPage } from '../pages/payroll-cutoff.page';
import { PayslipPage, PayslipPrintPage } from '../pages/payslip.page';
import { money } from '../support/format';
import type { CutoffDetail } from '../support/types';

// One payroll run covers everyone in the cutoff, so this file runs serially and is not @stress.
test.describe.configure({ mode: 'serial' });

const RECURRING = 500;
// The two most recent ENDED cutoffs. They are always one 1–15 and one 16–end, so every run exercises
// both halves of the rule "recurring deductions are taken on the 1–15 cutoff only" — not just whichever
// half happens to be current today.
const CUTOFFS: Cutoff[] = [previousCutoff(), cutoffBefore(previousCutoff())];

interface Case {
  cutoff: Cutoff;
  world: World;
  employeeName: string;
  expectedNet: number;
  runId: number;
}

test.describe('payroll', () => {
  const cases: Case[] = [];

  test.beforeAll(async ({ api }) => {
    // Set EVERYTHING up before anything is finalized: hiring someone before a finalized cutoff is refused,
    // so a later cutoff must not be finalized while an earlier cutoff's world is still to be built.
    for (const cutoff of CUTOFFS) {
      // Leave no run behind: an earlier run of this file, or a failed one, may have finalized the cutoff.
      // `run` is only the active (non-voided) run.
      const existing = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
      if (existing.run) await api.post(`/payroll/runs/${existing.run.id}/void`, { reason: 'e2e cleanup' });
    }

    for (const cutoff of CUTOFFS) {
      const world = await buildWorld(api, {
        employees: 1,
        hireDate: addDays(cutoff.periodStart, -30),
        dailyRate: 600,
        restDays: [0],
        recurringDeduction: RECURRING,
      });
      const employee = world.employees[0];
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
      cases.push({
        cutoff,
        world,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        expectedNet: basic + holidayPay - deduction,
        runId: 0,
      });
    }
  });

  for (const [index, cutoff] of CUTOFFS.entries()) {
    test.describe(`cutoff ${cutoff.periodStart} – ${cutoff.periodEnd} (${cutoff.half === 1 ? '1–15: deduction applies' : '16–end: no deduction'})`, () => {
      test('draft shows rate × days + holiday pay − deductions', async ({ page, api }) => {
        const c = cases[index];
        // The API's draft (the one computePayslip) must agree with the rule computed above…
        const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
        const draft = detail.draft!.payslips.find((s) => s.employeeId === c.world.employees[0].id)!;
        expect(draft.netPay).toBe(c.expectedNet);

        // …and the page must show it.
        const payroll = new PayrollCutoffPage(page);
        await payroll.open(cutoff.periodStart);
        await expect(payroll.net(c.employeeName)).toHaveText(money(c.expectedNet));
      });

      test('finalize freezes the payslip, and the print page lists it', async ({ page, api }) => {
        const c = cases[index];
        const payroll = new PayrollCutoffPage(page);
        await payroll.open(cutoff.periodStart);
        c.runId = await payroll.finalize(cutoff.periodStart);

        const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
        const slips = detail.run!.payslips;
        const slip = slips.find((s) => s.employeeId === c.world.employees[0].id)!;
        expect(slip.netPay).toBe(c.expectedNet);

        const payslip = new PayslipPage(page);
        await payslip.open(slip.id);
        await expect(payslip.net).toHaveText(money(c.expectedNet));

        // The print page shows every payslip of the run: one per employee, ours among them.
        const print = new PayslipPrintPage(page);
        await print.open(c.runId, slips.length);
        await expect(print.netAmounts).toHaveCount(slips.length);
        await expect(print.netAmounts.filter({ hasText: money(c.expectedNet) }).first()).toBeVisible();
        await expect(page.getByText(c.employeeName, { exact: true }).first()).toBeVisible();
      });

      test('a finalized cutoff refuses a new absence', async ({ api }) => {
        const c = cases[index];
        const days = workingDays(cutoff, c.world.employees[0].restDays);
        const res = await api.raw('POST', '/absences', { employeeId: c.world.employees[0].id, date: days[2] });
        expect(res.status()).toBe(409);
        expect(await res.text()).toMatch(/is finalized/);
      });

      test('void, then finalize again', async ({ page }) => {
        const c = cases[index];
        const payroll = new PayrollCutoffPage(page);
        await payroll.open(cutoff.periodStart);
        await payroll.voidRun('e2e: correcting the cutoff');
        const again = await payroll.finalize(cutoff.periodStart);
        expect(again).not.toBe(c.runId); // a fresh run; the voided one is kept on record
        await payroll.voidRun('e2e: leave the cutoff open'); // so the next run of this file starts clean
      });
    });
  }
});
