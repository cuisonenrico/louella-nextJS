import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { test, expect } from '../fixtures/test';
import { Api } from '../fixtures/api';
import { addDays, cutoffBefore, previousCutoff, workingDays, type Cutoff } from '../fixtures/dates';
import { buildWorld, type World } from '../fixtures/world';
import { expectPrintable } from '../support/printable';
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

      if (index === 0) {
        test('absences & rates open over the cutoff, and the draft follows each change', async ({ page }) => {
          const c = cases[index];
          const employee = c.world.employees[0];
          const day = workingDays(cutoff, employee.restDays)[2]; // not the absence or the holiday set up above
          const payroll = new PayrollCutoffPage(page);
          await payroll.open(cutoff.periodStart);
          await expect(payroll.absent(c.employeeName)).toHaveText('1');

          let dialog = await payroll.openInputs(c.employeeName);
          await expect(page).toHaveURL(new RegExp(`/payroll/${cutoff.periodStart}$`)); // stayed on the cutoff
          const marked = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/absences'));
          await dialog.getByRole('button', { name: day, exact: true }).click(); // the calendar opens on the cutoff's month
          expect((await marked).ok()).toBe(true);
          await expect(dialog.getByRole('button', { name: day, exact: true })).toHaveAttribute('aria-pressed', 'true');
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();

          // Back where the admin left off — same page, row still expanded, no reload — and the draft has
          // already moved: one more absent day, one daily rate less.
          await expect(page).toHaveURL(new RegExp(`/payroll/${cutoff.periodStart}$`));
          await expect(page.getByRole('button', { name: 'Absences & rates' })).toBeVisible();
          await expect(payroll.absent(c.employeeName)).toHaveText('2');
          await expect(payroll.net(c.employeeName)).toHaveText(money(c.expectedNet - employee.dailyRate));

          // Clear it again the same way, leaving the cutoff as the other tests expect it.
          await page.getByRole('button', { name: 'Absences & rates' }).click();
          dialog = page.getByRole('dialog', { name: c.employeeName });
          const cleared = page.waitForResponse((r) => r.request().method() === 'DELETE' && /\/api\/v1\/absences\/\d+$/.test(r.url()));
          await dialog.getByRole('button', { name: day, exact: true }).click();
          expect((await cleared).ok()).toBe(true);
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
          await expect(payroll.absent(c.employeeName)).toHaveText('1');
          await expect(payroll.net(c.employeeName)).toHaveText(money(c.expectedNet));
        });
      }

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

// Companies: each branch trades under its own business name, and a finalized run exports one payroll sheet
// per company, laid out like the client's paper payroll. Uses a third, older cutoff so it never races the two
// above (this file is serial, and a run covers everyone in its cutoff).
test.describe('payroll by company', () => {
  const cutoff = cutoffBefore(cutoffBefore(previousCutoff()));
  let world: World;
  let company: { id: number; name: string };
  const ADDRESS = '#29 Gov. Sison St., Lingayen, Pangasinan';

  test.beforeAll(async ({ api }) => {
    const existing = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    if (existing.run) await api.post(`/payroll/runs/${existing.run.id}/void`, { reason: 'e2e cleanup' });
    world = await buildWorld(api, { employees: 2, hireDate: addDays(cutoff.periodStart, -30), dailyRate: 500, restDays: [0] });
  });

  test('an admin adds a company and assigns employees to it from the list', async ({ page, api }) => {
    const name = `E2E${world.id} BAKESHOP (main)`;
    await page.goto('/employees');
    await page.getByRole('button', { name: 'Companies' }).click();
    const dialog = page.getByRole('dialog', { name: 'Companies' });
    const form = dialog.getByRole('form', { name: 'New company' });
    await form.getByLabel('Company name').fill(name);
    await form.getByLabel('Address').fill(ADDRESS);
    await form.getByLabel('Paymaster (in-charge)').fill('MARILOU C. SISON');
    await form.getByLabel('Approved by (manager)').fill('LESLEY MAULEON CUISON');
    await form.getByRole('button', { name: 'Add company' }).click();
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByPlaceholder('Search employees…').fill(`E2E${world.id}`);
    for (const e of world.employees) {
      await page.getByRole('checkbox', { name: `Select ${e.firstName} ${e.lastName}` }).check();
    }
    await page.getByRole('button', { name: 'Assign company (2)' }).click();
    const assign = page.getByRole('dialog', { name: 'Assign company' });
    await assign.getByRole('combobox', { name: 'Company to assign' }).click();
    await page.getByRole('option', { name, exact: true }).click();
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/v1/employees/company'));
    await assign.getByRole('button', { name: 'Assign' }).click();
    expect((await saved).ok()).toBe(true);
    for (const e of world.employees) {
      await expect(page.getByRole('row').filter({ hasText: `${e.firstName} ${e.lastName}` })).toContainText(name);
    }

    const companies = await api.get<Array<{ id: number; name: string; address: string }>>('/companies');
    const created = companies.find((c) => c.name === name)!;
    expect(created.address).toBe(ADDRESS);
    company = { id: created.id, name };
    for (const e of world.employees) {
      expect((await api.get<{ company: { id: number } | null }>(`/employees/${e.id}`)).company?.id).toBe(company.id);
    }
  });

  test('a finalized run exports the company payroll sheet, and renaming the company later does not move it', async ({ page, api }) => {
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    const runId = await payroll.finalize(cutoff.periodStart);

    const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    const ours = detail.run!.payslips.filter((s) => world.employees.some((e) => e.id === s.employeeId));
    expect(ours).toHaveLength(2);
    const expectedTotal = ours.reduce((sum, s) => sum + Math.round(s.netPay * 100), 0) / 100;

    await page.getByRole('button', { name: 'Export payroll sheet' }).click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: company.name, exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(new RegExp(`^payroll-${cutoff.periodStart}-.+\\.xlsx$`));
    const file = readFileSync((await download.path())!);
    const wb = XLSX.read(file, { type: 'buffer' });
    // Only this company: its file shows nobody else's pay.
    expect(wb.SheetNames).toHaveLength(1);
    // Printed like the client's paper payroll: landscape on long paper, bold bordered headings.
    await expectPrintable(file, wb.SheetNames[0], { paper: 'legal', header: 'SALARY' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: true, defval: null });
    const flat = rows.flat();
    expect(flat).toContain('P A Y R O L L');
    expect(flat).toContain(`WE HEREBY ACKNOWLEDGE to have received from ${company.name}, ${ADDRESS}`);
    expect(flat).toContain('MARILOU C. SISON');
    expect(flat).toContain('LESLEY MAULEON CUISON');
    for (const e of world.employees) expect(flat).toContain(`${e.lastName}, ${e.firstName}`);
    const total = rows.find((r) => r[1] === 'TOTAL')!;
    expect(total[19]).toBe(expectedTotal); // NET SALARY column

    // The payslip snapshot keeps the name it was finalized under.
    await api.patch(`/companies/${company.id}`, { name: `${company.name} RENAMED` });
    const res = await api.raw('GET', `/payroll/runs/${runId}/export`, undefined, { company: company.name });
    expect(res.status()).toBe(200);
    expect(XLSX.read(await res.body(), { type: 'buffer' }).SheetNames).toHaveLength(1);

    await payroll.voidRun('e2e: leave the cutoff open');
    expect((await api.raw('GET', `/payroll/runs/${runId}/export`)).status()).toBe(409);
  });

  test('a manager cannot read or manage companies', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: 'http://localhost:4100' });
    const manager = await Api.login(request, { email: world.manager.email, password: world.manager.password });
    expect((await manager.raw('GET', '/companies')).status()).toBe(403);
    expect((await manager.raw('POST', '/companies', { name: 'Nope' })).status()).toBe(403);
    await request.dispose();
  });
});
