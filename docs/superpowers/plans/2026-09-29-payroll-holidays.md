# Payroll Holidays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-set regular and special holidays are paid automatically on every payslip, using two multipliers kept in settings.

**Architecture:** The pure `computePayslip` learns the holiday rules and emits `HOLIDAY` lines plus a `holidayPay` total. `PayrollDraftService` loads holidays, rest-day marks and the multipliers and passes them in; finalize freezes the result like any other line. A new `HolidaysController` (admin-only, feature `payroll`) manages holidays, rest-day marks and the multipliers; the UI gets a Settings → Payroll page and a holidays panel on the cutoff page.

**Tech Stack:** NestJS 11 + Prisma 6 (PostgreSQL/Supabase), Next.js 16 App Router, TanStack Query, shadcn/ui, jest (server), vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-09-29-payroll-holidays-design.md`

## Global Constraints

- **Production database:** the local `.env` `DATABASE_URL` is the production Supabase project. Never run `prisma migrate dev`, `migrate reset` or `db push`. Write migration SQL by hand (Task 2). Applying it (`npm run prisma:deploy`) needs the user's explicit go-ahead.
- Dates are `YYYY-MM-DD` strings in the Manila calendar; never derive a date from the process clock (`manilaToday()` from `@/lib/manilaDate` when "today" is needed).
- Money is summed in integer centavos (`centavos()` / `pesos()` in `src/server/common/utils/decimal.util.ts`).
- Multipliers: `Decimal(4,2)`, 1.00–5.00, at most two decimals. Defaults: regular **2.00**, special **1.30**.
- Soft delete only (`deletedAt`); nothing is hard-deleted.
- Every holiday and rest-day-mark writer calls `assertCutoffOpen(tx, periodStart)` (advisory lock namespace 4) inside its transaction. Multiplier writes take no lock.
- Payroll routes are `@Roles(UserRole.ADMIN)` + `@RequireFeature('payroll')` at the class level, reads included.
- After any `prisma/schema.prisma` change run `npm run prisma:generate` (stop the dev server first on Windows).
- The global `ValidationPipe` is `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01A66FqNBEVG4mMzP1iCZSkW
  ```

### Deviations from the spec (decided while planning)

1. `GET /payroll/cutoffs/:periodStart` returns `holidays` at the **top level** of the response, in every status — not inside `draft` — so the cutoff page can show the panel (disabled) for a finalized cutoff too.
2. Settings → Payroll lives at `/settings/payroll`, added to the existing `payroll` feature's `routes`. It gets **no sidebar entry** (a feature has one `nav`); it is reached from a "Holidays & multipliers" button on `/payroll`. A separate feature key would need a permission-seed migration for little gain.
3. The payslip shows holiday lines in their own **Holiday pay** section (with its own total) between Earnings and Deductions.

## Review Focus

1. **An unknown warning code in the UI** — `CutoffTable`'s `WarningBadges` falls through to "No days worked" for any code it does not know, so the new `IGNORED_REST_DAY_MARK` would be mislabelled. Expected: its own badge. Test in Task 4.
2. **Half-centavo rounding of a multiplier** — ₱123.45 × 1.30 = ₱160.485 must round half-up to ₱160.49 (float math gives ₱160.48). Test in Task 1.
3. **A holiday outside the employee's employment** (hired after it, separated before it) — no holiday line, not even the 1.00 rest-day line. Test in Task 1.
4. **Editing a holiday's date through PATCH** — must be refused, not silently ignored (the global pipe's `forbidNonWhitelisted` rejects it because `UpdateHolidayDto` has no `date`). Test in Task 3.
5. **A closed holiday on a rest day with a stale mark** — pays 1.00, never the multiplier. Test in Task 1.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/server/payroll/compute-payslip.ts` | modify | Holiday rules, `HOLIDAY` lines, `holidayPay` |
| `src/server/common/utils/decimal.util.ts` | modify | `scaleCentavos()` — half-up multiply of centavos |
| `prisma/schema.prisma` | modify | `Holiday`, `HolidayRestDayWork`, `PayrollSettings`, `Payslip.holidayPay`, `PayslipLineType.HOLIDAY` |
| `prisma/migrations/20261003100000_payroll_holidays/migration.sql` | create | Hand-written migration |
| `src/server/payroll/payroll-settings.ts` | create | `readMultipliers(db)` + defaults, shared by draft and settings service |
| `src/server/payroll/payroll-draft.service.ts` | modify | Load holidays, marks, multipliers; `holidays()` panel data |
| `src/server/payroll/payroll-runs.service.ts` | modify | Return `holidays` from `getCutoff`; freeze `holidayPay` |
| `src/server/common/utils/audit.util.ts` | modify | Audit entities `Holiday`, `HolidayRestDayWork`, `PayrollSettings` |
| `src/server/payroll/dto/holiday.dto.ts` | create | DTOs |
| `src/server/payroll/holidays.service.ts` | create | Holiday + mark writers, list |
| `src/server/payroll/payroll-settings.service.ts` | create | Get/update multipliers |
| `src/server/payroll/holidays.controller.ts` | create | Routes |
| `src/server/payroll/payroll.module.ts` | modify | Register controller + services |
| `src/types/index.ts` | modify | Frontend types |
| `src/lib/apiServices.ts` | modify | `payrollApi` holiday/settings calls |
| `src/app/(app)/payroll/_components/PayslipView.tsx` | modify | Holiday pay section |
| `src/app/(app)/payroll/_components/CutoffTable.tsx` | modify | Holiday column, line label, warning badge |
| `src/app/(app)/payroll/_components/HolidaysPanel.tsx` | create | Cutoff-page panel with Worked toggles |
| `src/app/(app)/payroll/[periodStart]/page.tsx` | modify | Render the panel |
| `src/app/(app)/settings/payroll/page.tsx` | create | Settings → Payroll |
| `src/app/(app)/settings/payroll/_components/MultipliersCard.tsx` | create | Multipliers form |
| `src/app/(app)/settings/payroll/_components/HolidaysCard.tsx` | create | Holidays table + dialog |
| `src/app/(app)/payroll/page.tsx` | modify | Link to settings |
| `src/lib/rbac/features.ts` | modify | Add `/settings/payroll` route to `payroll` |
| `AGENTS.md` | modify | Document the holiday rules |

---

### Task 1: Holiday rules in `computePayslip`

**Files:**
- Modify: `src/server/common/utils/decimal.util.ts` (append after `pesos`)
- Modify: `src/server/payroll/compute-payslip.ts`
- Test: `src/server/payroll/compute-payslip.spec.ts`

**Interfaces:**
- Consumes: `eachDate`, `weekdayOf`, `Cutoff` from `@/lib/payroll/cutoff`; `centavos`, `pesos` from decimal.util.
- Produces (later tasks rely on these exact names):
  ```ts
  export function scaleCentavos(cents: number, factor: number): number; // decimal.util
  export type LineType = 'BASIC' | 'HOLIDAY' | 'ADDITION' | 'DEDUCTION' | 'EMPLOYER_SHARE';
  export type LineSource = 'EmployeeRate' | 'Holiday' | 'PayrollAdjustment' | 'RecurringDeduction' | 'BranchVale';
  export type HolidayType = 'REGULAR' | 'SPECIAL';
  export interface HolidayInput { id: number; date: string; name: string; type: HolidayType; isClosed: boolean }
  export interface HolidayMultipliers { regular: number; special: number }
  // PayslipInput gains: holidays: HolidayInput[]; restDayWorkHolidayIds: number[]; multipliers: HolidayMultipliers;
  // PayslipWarning gains: { code: 'IGNORED_REST_DAY_MARK'; blocking: false; dates: string[] }
  // ComputedPayslip gains: holidayPay: number
  ```

Calendar facts for the tests: Sep 1 2026 is a Tuesday; with `restDays: [0]` the Sundays Sep 6 and 13 are rest days, leaving 13 working days in Sep 1–15.

- [ ] **Step 1: Write the failing tests**

In `compute-payslip.spec.ts`, extend the `input()` helper defaults and add a `describe('holidays')` block at the end of the file:

```ts
function input(overrides: Partial<PayslipInput> = {}): PayslipInput {
  return {
    employee: { id: 1, restDays: [0], hiredOn: '2026-01-01', separatedOn: null },
    cutoff: FIRST_HALF,
    rates: [{ id: 10, dailyRate: 600, effectiveOn: '2026-01-01' }],
    absences: [],
    adjustments: [],
    vale: [],
    recurring: [],
    skippedRecurringIds: [],
    holidays: [],
    restDayWorkHolidayIds: [],
    multipliers: { regular: 2, special: 1.3 },
    ...overrides,
  };
}
```

```ts
describe('holidays', () => {
  const regular = (date: string, over: Partial<HolidayInput> = {}): HolidayInput => ({
    id: 90, date, name: 'Holiday', type: 'REGULAR', isClosed: false, ...over,
  });
  const special = (date: string, over: Partial<HolidayInput> = {}): HolidayInput => regular(date, { type: 'SPECIAL', ...over });
  const holidayLines = (slip: ReturnType<typeof computePayslip>) => slip.lines.filter((l) => l.type === 'HOLIDAY');

  it('pays a worked regular holiday at the regular multiplier, outside basic pay', () => {
    const slip = computePayslip(input({ holidays: [regular('2026-09-08')] }));
    expect(slip.lines.filter((l) => l.type === 'BASIC')).toEqual([
      { type: 'BASIC', label: 'Basic pay', quantity: 12, rate: 600, amount: 7200, sourceType: 'EmployeeRate', sourceId: 10 },
    ]);
    expect(holidayLines(slip)).toEqual([
      { type: 'HOLIDAY', label: 'Regular holiday — Sep 8 (worked)', quantity: 2, rate: 600, amount: 1200, sourceType: 'Holiday', sourceId: 90 },
    ]);
    expect(slip).toMatchObject({ workingDays: 13, absenceDays: 0, daysWorked: 13, basicPay: 7200, holidayPay: 1200, netPay: 8400 });
  });

  it('pays a worked special holiday at the special multiplier', () => {
    const slip = computePayslip(input({ holidays: [special('2026-09-08')] }));
    expect(holidayLines(slip)[0]).toMatchObject({ label: 'Special holiday — Sep 8 (worked)', quantity: 1.3, amount: 780 });
    expect(slip.netPay).toBe(7980);
  });

  it('pays nothing for an absence on a scheduled holiday', () => {
    const slip = computePayslip(input({ holidays: [regular('2026-09-08')], absences: ['2026-09-08'] }));
    expect(holidayLines(slip)).toEqual([]);
    expect(slip).toMatchObject({ absenceDays: 1, daysWorked: 12, basicPay: 7200, holidayPay: 0, netPay: 7200 });
  });

  it('pays nothing for a closed holiday on a scheduled day, and counts it absent', () => {
    const slip = computePayslip(input({ holidays: [regular('2026-09-08', { isClosed: true })] }));
    expect(holidayLines(slip)).toEqual([]);
    expect(slip).toMatchObject({ absenceDays: 1, daysWorked: 12, netPay: 7200 });
  });

  it('pays 100% for a holiday on an unmarked rest day, either type', () => {
    const slip = computePayslip(input({ holidays: [regular('2026-09-06'), special('2026-09-13', { id: 91 })] }));
    expect(holidayLines(slip).map((l) => [l.label, l.quantity, l.amount])).toEqual([
      ['Regular holiday — Sep 6 (rest day)', 1, 600],
      ['Special holiday — Sep 13 (rest day)', 1, 600],
    ]);
    expect(slip).toMatchObject({ daysWorked: 13, basicPay: 7800, holidayPay: 1200 });
  });

  it('pays the multiplier for a rest-day holiday marked worked, and counts the day worked', () => {
    const slip = computePayslip(input({ holidays: [special('2026-09-13', { id: 91 })], restDayWorkHolidayIds: [91] }));
    expect(holidayLines(slip)).toEqual([
      { type: 'HOLIDAY', label: 'Special holiday — Sep 13 (rest day, worked)', quantity: 1.3, rate: 600, amount: 780, sourceType: 'Holiday', sourceId: 91 },
    ]);
    expect(slip.daysWorked).toBe(14);
  });

  it('pays 100% for a closed holiday on a rest day even with a mark', () => {
    const slip = computePayslip(input({ holidays: [regular('2026-09-06', { isClosed: true })], restDayWorkHolidayIds: [90] }));
    expect(holidayLines(slip)[0]).toMatchObject({ label: 'Regular holiday — Sep 6 (rest day)', quantity: 1, amount: 600 });
    expect(slip.daysWorked).toBe(13);
  });

  it('ignores a mark on a day that is no longer a rest day, with a warning', () => {
    const slip = computePayslip(input({ holidays: [regular('2026-09-08')], restDayWorkHolidayIds: [90] }));
    expect(holidayLines(slip)[0]).toMatchObject({ label: 'Regular holiday — Sep 8 (worked)', quantity: 2 });
    expect(slip.warnings).toEqual([{ code: 'IGNORED_REST_DAY_MARK', blocking: false, dates: ['2026-09-08'] }]);
  });

  it('pays the rate in effect on the holiday after a mid-cutoff raise', () => {
    const slip = computePayslip(
      input({
        rates: [
          { id: 10, dailyRate: 600, effectiveOn: '2026-01-01' },
          { id: 11, dailyRate: 650, effectiveOn: '2026-09-08' },
        ],
        holidays: [regular('2026-09-10')],
      }),
    );
    expect(slip.lines.filter((l) => l.type === 'BASIC').map((l) => [l.quantity, l.rate])).toEqual([[6, 600], [6, 650]]);
    expect(holidayLines(slip)[0]).toMatchObject({ rate: 650, amount: 1300 });
  });

  it('blocks on a missing rate for a paid holiday', () => {
    const slip = computePayslip(input({ rates: [], holidays: [regular('2026-09-06')] }));
    const missing = slip.warnings.find((w) => w.code === 'MISSING_RATE');
    expect(missing).toMatchObject({ blocking: true });
    expect(missing && 'dates' in missing ? missing.dates : []).toEqual(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
       '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14', '2026-09-15'],
    );
  });

  it('rounds a multiplied half centavo up', () => {
    const slip = computePayslip(input({ rates: [{ id: 10, dailyRate: 123.45, effectiveOn: '2026-01-01' }], holidays: [special('2026-09-08')] }));
    expect(holidayLines(slip)[0].amount).toBe(160.49);
  });

  it('pays nothing for a holiday outside the employment window', () => {
    const hiredLater = computePayslip(
      input({ employee: { id: 1, restDays: [0], hiredOn: '2026-09-10', separatedOn: null }, holidays: [regular('2026-09-06')] }),
    );
    expect(holidayLines(hiredLater)).toEqual([]);
    expect(hiredLater.holidayPay).toBe(0);
  });

  it('adds holiday pay to net pay alongside additions and deductions', () => {
    const slip = computePayslip(
      input({
        holidays: [regular('2026-09-08')],
        adjustments: [{ id: 5, kind: 'ADDITION', category: 'BONUS', description: 'Bonus', amount: 100 }],
        recurring: [SSS],
      }),
    );
    // 7200 basic + 1200 holiday + 100 bonus − 450 SSS
    expect(slip.netPay).toBe(8050);
    expect(slip.lines.map((l) => l.type)).toEqual(['BASIC', 'HOLIDAY', 'ADDITION', 'DEDUCTION', 'EMPLOYER_SHARE']);
  });
});
```

Also add `type HolidayInput` to the import at the top: `import { computePayslip, employmentWindow, type HolidayInput, type PayslipInput } from './compute-payslip';`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/server/payroll/compute-payslip.spec.ts`
Expected: FAIL — TypeScript errors on `holidays`/`HolidayInput`/`holidayPay`.

- [ ] **Step 3: Add `scaleCentavos` to decimal.util**

Append to `src/server/common/utils/decimal.util.ts` after `pesos`:

```ts
/**
 * Centavos × a factor (a holiday multiplier), rounded half-up to whole
 * centavos. Decimal, not float: 12345 × 1.3 is 16048.5, which float math
 * lands just under and would round down.
 */
export function scaleCentavos(cents: number, factor: number): number {
  return new Prisma.Decimal(cents).mul(factor).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}
```

- [ ] **Step 4: Implement the rules in `compute-payslip.ts`**

1. Change the import to `import { centavos, pesos, scaleCentavos } from '../common/utils/decimal.util';`
2. Replace the type block at the top:

```ts
export type AdjustmentKind = 'ADDITION' | 'DEDUCTION';
export type LineType = 'BASIC' | 'HOLIDAY' | 'ADDITION' | 'DEDUCTION' | 'EMPLOYER_SHARE';
export type LineSource = 'EmployeeRate' | 'Holiday' | 'PayrollAdjustment' | 'RecurringDeduction' | 'BranchVale';
export type HolidayType = 'REGULAR' | 'SPECIAL';
```

3. After `RecurringInput`, add:

```ts
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
```

4. Add to `PayslipInput`:

```ts
  holidays: HolidayInput[];
  /** Holidays this employee worked although it was their rest day. */
  restDayWorkHolidayIds: number[];
  multipliers: HolidayMultipliers;
```

5. Add to `PayslipWarning`: `| { code: 'IGNORED_REST_DAY_MARK'; blocking: false; dates: string[] }`
6. Add `holidayPay: number;` to `ComputedPayslip` after `basicPay`.
7. Replace steps 1–4 of `computePayslip` (from `// 1–3.` through the end of the `for (const { rate, days } of segments)` loop) with:

```ts
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
```

8. Replace step 8 and the return block:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/server/payroll/compute-payslip.spec.ts`
Expected: PASS, all old and new tests. (`payroll-draft.service.ts` will not type-check until Task 2 — do not run `tsc` yet.)

- [ ] **Step 6: Commit**

```bash
git add src/server/common/utils/decimal.util.ts src/server/payroll/compute-payslip.ts src/server/payroll/compute-payslip.spec.ts
git commit -m "feat(payroll): compute holiday pay in computePayslip"
```

---

### Task 2: Schema, migration, draft loading and finalize

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261003100000_payroll_holidays/migration.sql`
- Create: `src/server/payroll/payroll-settings.ts`
- Modify: `src/server/payroll/payroll-draft.service.ts`
- Modify: `src/server/payroll/payroll-runs.service.ts`
- Test: `src/server/payroll/payroll-draft.service.spec.ts`, `src/server/payroll/payroll-runs.service.spec.ts`

**Interfaces:**
- Consumes: `computePayslip`, `HolidayInput`, `HolidayMultipliers` (Task 1).
- Produces:
  ```ts
  // payroll-settings.ts
  export const DEFAULT_MULTIPLIERS: HolidayMultipliers; // { regular: 2, special: 1.3 }
  export async function readMultipliers(db: Prisma.TransactionClient): Promise<HolidayMultipliers>;
  // payroll-draft.service.ts
  export interface CutoffHoliday {
    id: number; date: string; name: string; type: 'REGULAR' | 'SPECIAL'; isClosed: boolean;
    restDayEmployees: { employeeId: number; employeeName: string; markId: number | null }[];
  }
  PayrollDraftService.holidays(periodStart: string, db?: Prisma.TransactionClient): Promise<CutoffHoliday[]>;
  // getCutoff() response gains `holidays: CutoffHoliday[]` in every status.
  ```

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`:

1. Add `HOLIDAY` to `enum PayslipLineType` after `BASIC`.
2. In `model Employee`, after `vale BranchVale[]`, add `holidayRestDayWork HolidayRestDayWork[]`.
3. In `model Payslip`, after `basicPay`, add `holidayPay Decimal @default(0) @db.Decimal(12, 2)`.
4. After `model PayslipLine { … }` add:

```prisma
enum HolidayType {
  REGULAR
  SPECIAL
}

/// A nationwide holiday. Open (the bakery operates) unless isClosed.
/// One live holiday per date: a partial unique index in the migration SQL.
model Holiday {
  id          Int         @id @default(autoincrement())
  date        DateTime    @db.Date
  name        String
  type        HolidayType
  isClosed    Boolean     @default(false)
  createdById Int?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  deletedAt   DateTime?

  restDayWork HolidayRestDayWork[]

  @@index([date])
}

/// "This employee worked this holiday although it was their rest day."
model HolidayRestDayWork {
  id          Int       @id @default(autoincrement())
  holidayId   Int
  employeeId  Int
  createdById Int?
  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  holiday  Holiday  @relation(fields: [holidayId], references: [id])
  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([holidayId])
  @@index([employeeId])
}

/// Singleton (id 1), seeded by the migration with the DOLE defaults.
model PayrollSettings {
  id                       Int      @id @default(1)
  regularHolidayMultiplier Decimal  @default(2.00) @db.Decimal(4, 2)
  specialHolidayMultiplier Decimal  @default(1.30) @db.Decimal(4, 2)
  updatedById              Int?
  updatedAt                DateTime @updatedAt
}
```

Run `npx prisma format` and confirm `git diff prisma/schema.prisma` touches only these models.

- [ ] **Step 2: Generate the migration SQL without touching the database**

```bash
git show HEAD:prisma/schema.prisma > "$TMPDIR/old-schema.prisma"
npx prisma migrate diff --from-schema-datamodel "$TMPDIR/old-schema.prisma" --to-schema-datamodel prisma/schema.prisma --script
```

(`$TMPDIR` = the session scratchpad.) Save the output as `prisma/migrations/20261003100000_payroll_holidays/migration.sql`, then append the part Prisma cannot express. The final file should read:

```sql
-- Payroll holidays. See docs/superpowers/specs/2026-09-29-payroll-holidays-design.md.

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('REGULAR', 'SPECIAL');

-- AlterEnum
ALTER TYPE "PayslipLineType" ADD VALUE 'HOLIDAY';

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN "holidayPay" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayRestDayWork" (
    "id" SERIAL NOT NULL,
    "holidayId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HolidayRestDayWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "regularHolidayMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 2.00,
    "specialHolidayMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.30,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE INDEX "HolidayRestDayWork_holidayId_idx" ON "HolidayRestDayWork"("holidayId");
CREATE INDEX "HolidayRestDayWork_employeeId_idx" ON "HolidayRestDayWork"("employeeId");

-- AddForeignKey
ALTER TABLE "HolidayRestDayWork" ADD CONSTRAINT "HolidayRestDayWork_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HolidayRestDayWork" ADD CONSTRAINT "HolidayRestDayWork_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Not expressible in Prisma: one live holiday per date, one live mark per
-- holiday and employee, multiplier bounds, and the singleton row.
CREATE UNIQUE INDEX "Holiday_live_date_key"
  ON "Holiday"("date") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "HolidayRestDayWork_live_key"
  ON "HolidayRestDayWork"("holidayId", "employeeId") WHERE "deletedAt" IS NULL;
ALTER TABLE "PayrollSettings"
  ADD CONSTRAINT "PayrollSettings_multipliers_check"
  CHECK ("regularHolidayMultiplier" BETWEEN 1.00 AND 5.00
     AND "specialHolidayMultiplier" BETWEEN 1.00 AND 5.00),
  ADD CONSTRAINT "PayrollSettings_singleton_check" CHECK ("id" = 1);
INSERT INTO "PayrollSettings" ("id", "updatedAt") VALUES (1, now());
```

If the generated part differs from the block above (ordering, spacing), keep Prisma's output and append only the final section. **Do not apply it.**

- [ ] **Step 3: Regenerate the client**

Run: `npm run prisma:generate` (dev server stopped). Expected: `Generated Prisma Client`.

- [ ] **Step 4: Create `src/server/payroll/payroll-settings.ts`**

```ts
import { Prisma } from '@prisma/client';
import { num } from '../common/utils/decimal.util';
import type { HolidayMultipliers } from './compute-payslip';

/** The DOLE defaults, also seeded into the PayrollSettings row by the migration. */
export const DEFAULT_MULTIPLIERS: HolidayMultipliers = { regular: 2, special: 1.3 };

/** The live multipliers; the defaults if the singleton row is missing. */
export async function readMultipliers(db: Prisma.TransactionClient): Promise<HolidayMultipliers> {
  const row = await db.payrollSettings.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULT_MULTIPLIERS;
  return { regular: num(row.regularHolidayMultiplier), special: num(row.specialHolidayMultiplier) };
}
```

- [ ] **Step 5: Write the failing draft-service tests**

In `payroll-draft.service.spec.ts`, replace the `beforeEach` prisma mock with:

```ts
  beforeEach(() => {
    prisma = {
      employee: { findMany: jest.fn().mockResolvedValue([employee()]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      payrollSettings: { findUnique: jest.fn().mockResolvedValue({ id: 1, regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 }) },
    };
    service = new PayrollDraftService(prisma as never);
  });
```

Add tests:

```ts
  it('loads the cutoff’s live holidays with their live rest-day marks', async () => {
    await service.build('2026-09-01');
    expect(prisma.holiday.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, date: { gte: at('2026-09-01'), lte: at('2026-09-15') } },
      include: { restDayWork: { where: { deletedAt: null }, select: { id: true, employeeId: true } } },
      orderBy: { date: 'asc' },
    });
  });

  it('pays holidays with the stored multipliers and this employee’s marks only', async () => {
    prisma.holiday.findMany.mockResolvedValue([
      { id: 90, date: at('2026-09-08'), name: 'A', type: 'REGULAR', isClosed: false, restDayWork: [] },
      { id: 91, date: at('2026-09-13'), name: 'B', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 5, employeeId: 1 }] },
      { id: 92, date: at('2026-09-06'), name: 'C', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 6, employeeId: 2 }] },
    ]);
    prisma.payrollSettings.findUnique.mockResolvedValue({ id: 1, regularHolidayMultiplier: 2.5, specialHolidayMultiplier: 1.5 });
    const draft = await service.build('2026-09-01');
    const holiday = draft.payslips[0].lines.filter((l) => l.type === 'HOLIDAY').map((l) => [l.sourceId, l.quantity]);
    // Sep 8 worked at 2.5; Sep 13 rest day marked → 1.5; Sep 6 rest day, marked for someone else → 1.00
    expect(holiday).toEqual([[92, 1], [90, 2.5], [91, 1.5]]);
  });

  it('falls back to the default multipliers when the settings row is missing', async () => {
    prisma.payrollSettings.findUnique.mockResolvedValue(null);
    prisma.holiday.findMany.mockResolvedValue([
      { id: 90, date: at('2026-09-08'), name: 'A', type: 'REGULAR', isClosed: false, restDayWork: [] },
    ]);
    const draft = await service.build('2026-09-01');
    expect(draft.payslips[0].lines.find((l) => l.type === 'HOLIDAY')?.quantity).toBe(2);
  });

  it('lists each holiday with the employees on rest day that date', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 1, firstName: 'Ana', lastName: 'Cruz', restDays: [0], hiredOn: at('2026-01-05'), separatedOn: null },
      { id: 2, firstName: 'Ben', lastName: 'Diaz', restDays: [2], hiredOn: at('2026-01-05'), separatedOn: null },
      { id: 3, firstName: 'Cy', lastName: 'Eco', restDays: [0], hiredOn: at('2026-09-10'), separatedOn: null },
    ]);
    prisma.holiday.findMany.mockResolvedValue([
      { id: 91, date: at('2026-09-06'), name: 'Sun holiday', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 5, employeeId: 1 }] },
    ]);
    const holidays = await service.holidays('2026-09-01');
    expect(holidays).toEqual([
      {
        id: 91,
        date: '2026-09-06',
        name: 'Sun holiday',
        type: 'SPECIAL',
        isClosed: false,
        // Ben rests on Tuesdays; Cy was hired after the holiday.
        restDayEmployees: [{ employeeId: 1, employeeName: 'Ana Cruz', markId: 5 }],
      },
    ]);
  });
```

Run: `npx jest src/server/payroll/payroll-draft.service.spec.ts` — Expected: FAIL (`holiday` not queried, `holidays` not a function).

- [ ] **Step 6: Implement in `payroll-draft.service.ts`**

1. Imports: add `import { weekdayOf } from '@/lib/payroll/cutoff';` (merge with the existing `cutoffOf` import) and `import { readMultipliers } from './payroll-settings';`, and `type HolidayInput` from `./compute-payslip`.
2. Add, above the class:

```ts
export interface CutoffHoliday {
  id: number;
  date: string;
  name: string;
  type: 'REGULAR' | 'SPECIAL';
  isClosed: boolean;
  /** Employees employed that day whose rest day it is, with their mark if any. */
  restDayEmployees: { employeeId: number; employeeName: string; markId: number | null }[];
}

function loadHolidays(db: Prisma.TransactionClient, start: Date, end: Date) {
  return db.holiday.findMany({
    where: { deletedAt: null, date: { gte: start, lte: end } },
    include: { restDayWork: { where: { deletedAt: null }, select: { id: true, employeeId: true } } },
    orderBy: { date: 'asc' },
  });
}

const employedDuring = (start: Date, end: Date) => ({
  deletedAt: null,
  hiredOn: { lte: end },
  OR: [{ separatedOn: null }, { separatedOn: { gte: start } }],
});
```

3. In `build()`, replace the inline `where` of `db.employee.findMany` with `where: employedDuring(start, end),` and, before `const payslips`, add:

```ts
    const [holidayRows, multipliers] = await Promise.all([loadHolidays(db, start, end), readMultipliers(db)]);
    const holidays: HolidayInput[] = holidayRows.map((h) => ({
      id: h.id,
      date: day(h.date),
      name: h.name,
      type: h.type,
      isClosed: h.isClosed,
    }));
```

(Keep the `employees` query where it is; `Promise.all` only for the two new reads.)

4. In the `computePayslip({ … })` call add:

```ts
        holidays,
        restDayWorkHolidayIds: holidayRows
          .filter((h) => h.restDayWork.some((m) => m.employeeId === e.id))
          .map((h) => h.id),
        multipliers,
```

5. Add the method after `build()`:

```ts
  /** The cutoff's holidays and, for each, who had it as a rest day. */
  async holidays(periodStart: string, db: Prisma.TransactionClient = this.prisma): Promise<CutoffHoliday[]> {
    const cutoff = cutoffOf(periodStart);
    const start = toUtcDay(cutoff.periodStart);
    const end = toUtcDay(cutoff.periodEnd);
    const rows = await loadHolidays(db, start, end);
    if (rows.length === 0) return [];
    const employees = await db.employee.findMany({
      where: employedDuring(start, end),
      select: { id: true, firstName: true, lastName: true, restDays: true, hiredOn: true, separatedOn: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((h) => {
      const date = day(h.date);
      const weekday = weekdayOf(date);
      const markBy = new Map(h.restDayWork.map((m) => [m.employeeId, m.id]));
      return {
        id: h.id,
        date,
        name: h.name,
        type: h.type,
        isClosed: h.isClosed,
        restDayEmployees: employees
          .filter(
            (e) =>
              e.restDays.includes(weekday) &&
              day(e.hiredOn) <= date &&
              (e.separatedOn === null || day(e.separatedOn) >= date),
          )
          .map((e) => ({ employeeId: e.id, employeeName: `${e.firstName} ${e.lastName}`, markId: markBy.get(e.id) ?? null })),
      };
    });
  }
```

Also update the existing "loads everyone employed…" test's `where` expectation — it stays identical (`employedDuring` returns the same object), so no change is needed; confirm it passes.

- [ ] **Step 7: Run the draft tests**

Run: `npx jest src/server/payroll/payroll-draft.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Write the failing runs-service tests**

In `payroll-runs.service.spec.ts`:
1. In the `draft()` fixture payslip add `holidayPay: 1200,` after `basicPay`, change `netPay: 7750` to `netPay: 8950` and `totals.netPay` to `8950`, and add a line after the BASIC one:
   `{ type: 'HOLIDAY', label: 'Regular holiday — Sep 8 (worked)', quantity: 2, rate: 600, amount: 1200, sourceType: 'Holiday', sourceId: 90 },`
2. Change `drafts` to `{ build: jest.fn().mockResolvedValue(draft()), holidays: jest.fn().mockResolvedValue([]) }` and its type to `{ build: jest.Mock; holidays: jest.Mock }`.
3. Update the "freezes the draft" test expectations: `totalNetPay: 8950`; payslip `toMatchObject({ …, netPay: 8950, holidayPay: 1200, daysWorked: 12 })`; line order `[[0, 'BASIC'], [1, 'HOLIDAY'], [2, 'ADDITION']]`; add
   `expect(payslip.lines.create[1]).toMatchObject({ type: 'HOLIDAY', quantity: 2, rate: 600, amount: 1200, sourceType: 'Holiday', sourceId: 90 });`
4. Add:

```ts
  describe('getCutoff', () => {
    it('returns the cutoff’s holidays with the draft', async () => {
      drafts.holidays.mockResolvedValue([{ id: 90, date: '2026-09-08', name: 'A', type: 'REGULAR', isClosed: false, restDayEmployees: [] }]);
      const view = await service.getCutoff('2026-09-01');
      expect(view.status).toBe('OPEN');
      expect(view.holidays).toHaveLength(1);
    });

    it('returns the holidays with a finalized run too', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue(runRow());
      drafts.holidays.mockResolvedValue([{ id: 90, date: '2026-09-08', name: 'A', type: 'REGULAR', isClosed: false, restDayEmployees: [] }]);
      const view = await service.getCutoff('2026-09-01');
      expect(view.status).toBe('FINALIZED');
      expect(view.holidays).toHaveLength(1);
    });
  });
```

(If a `describe('getCutoff')` already exists, add the two `it`s to it.)

Run: `npx jest src/server/payroll/payroll-runs.service.spec.ts` — Expected: FAIL (`holidayPay` missing, `holidays` undefined).

- [ ] **Step 9: Implement in `payroll-runs.service.ts`**

1. Replace `getCutoff`:

```ts
  /** The active run for a cutoff, or its live draft, plus its holidays. */
  async getCutoff(periodStart: string) {
    const { periodEnd } = cutoffOf(periodStart);
    const [run, holidays] = await Promise.all([
      this.prisma.payrollRun.findFirst({
        where: { periodStart: toUtcDay(periodStart), status: { not: 'VOIDED' } },
        include: RUN_INCLUDE,
      }),
      this.drafts.holidays(periodStart),
    ]);
    if (run) {
      return { periodStart, periodEnd, status: run.status as 'FINALIZED' | 'PAID', run: toRunView(run), draft: null, holidays };
    }
    return { periodStart, periodEnd, status: 'OPEN' as const, run: null, draft: await this.drafts.build(periodStart), holidays };
  }
```

2. In `finalize`, add `holidayPay: p.holidayPay,` after `basicPay: p.basicPay,` in `tx.payslip.create`.

- [ ] **Step 10: Run the payroll suites and the type-check**

Run: `npx jest src/server/payroll` then `npx tsc --noEmit -p .`
Expected: PASS; tsc exit 0.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261003100000_payroll_holidays src/server/payroll
git commit -m "feat(payroll): holiday tables, draft loading and frozen holiday pay"
```

---

### Task 3: Holidays, marks and multipliers API

**Files:**
- Modify: `src/server/common/utils/audit.util.ts`
- Create: `src/server/payroll/dto/holiday.dto.ts`
- Create: `src/server/payroll/payroll-settings.service.ts`
- Create: `src/server/payroll/holidays.service.ts`
- Create: `src/server/payroll/holidays.controller.ts`
- Modify: `src/server/payroll/payroll.module.ts`
- Test: `src/server/payroll/holidays.service.spec.ts`, `src/server/payroll/payroll-settings.service.spec.ts`, `src/server/payroll/holidays.authz.http.spec.ts`, `src/server/payroll/dto/holiday.dto.spec.ts`, `src/server/common/guards/rbac-matrix.spec.ts`

**Interfaces:**
- Consumes: `assertCutoffOpen`, `day` (`payroll-lock.util`); `readMultipliers`, `DEFAULT_MULTIPLIERS` (Task 2); `cutoffOf`, `weekdayOf` (`@/lib/payroll/cutoff`); `recordChanges`.
- Produces (HTTP, used by Task 4):
  - `GET /payroll/settings` → `{ regularHolidayMultiplier: number; specialHolidayMultiplier: number }`
  - `PATCH /payroll/settings` body `{ regularHolidayMultiplier?, specialHolidayMultiplier? }` → same shape
  - `GET /payroll/holidays?year=YYYY` → `{ id, date, name, type, isClosed, locked }[]`
  - `POST /payroll/holidays` body `{ date, name, type, isClosed? }` → holiday view
  - `PATCH /payroll/holidays/:id` body `{ name?, type?, isClosed? }` → holiday view
  - `DELETE /payroll/holidays/:id` → `{ id }`
  - `POST /payroll/holidays/:id/rest-day-work` body `{ employeeId }` → `{ id }`
  - `DELETE /payroll/rest-day-work/:id` → `{ id }`

- [ ] **Step 1: Register the audit entities**

In `audit.util.ts` add `| 'Holiday' | 'HolidayRestDayWork' | 'PayrollSettings'` to `AuditEntity`, and to `AUDITED_FIELDS`:

```ts
  Holiday: ['date', 'name', 'type', 'isClosed', 'deletedAt'],
  HolidayRestDayWork: ['holidayId', 'employeeId', 'deletedAt'],
  PayrollSettings: ['regularHolidayMultiplier', 'specialHolidayMultiplier'],
```

- [ ] **Step 2: Write the DTOs and their failing test**

`src/server/payroll/dto/holiday.dto.ts`:

```ts
import { HolidayType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/payroll.validators';

export class CreateHolidayDto {
  @IsCalendarDate()
  date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsEnum(HolidayType)
  type: HolidayType;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

/** No `date`: a holiday is moved by deleting and recreating it. */
export class UpdateHolidayDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(HolidayType)
  type?: HolidayType;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class CreateRestDayWorkDto {
  @IsInt()
  @IsPositive()
  employeeId: number;
}

export class UpdatePayrollSettingsDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(5)
  regularHolidayMultiplier?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(5)
  specialHolidayMultiplier?: number;
}
```

`src/server/payroll/dto/holiday.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateHolidayDto, UpdateHolidayDto, UpdatePayrollSettingsDto } from './holiday.dto';

/** Mirrors the global pipe: `{ whitelist: true, forbidNonWhitelisted: true }`. */
function errorsOf<T extends object>(cls: new () => T, plain: object): string[] {
  return validateSync(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);
}

describe('holiday DTOs', () => {
  it('accepts a holiday and rejects a bad date or type', () => {
    expect(errorsOf(CreateHolidayDto, { date: '2026-12-25', name: 'Christmas Day', type: 'REGULAR' })).toEqual([]);
    expect(errorsOf(CreateHolidayDto, { date: '2026-02-30', name: 'X', type: 'REGULAR' })).toEqual(['date']);
    expect(errorsOf(CreateHolidayDto, { date: '2026-12-25', name: 'X', type: 'DOUBLE' })).toEqual(['type']);
  });

  it('refuses to change a holiday’s date', () => {
    expect(errorsOf(UpdateHolidayDto, { date: '2026-12-26' })).toEqual(['date']);
  });

  it('keeps multipliers between 1.00 and 5.00 with two decimals', () => {
    expect(errorsOf(UpdatePayrollSettingsDto, { regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 })).toEqual([]);
    expect(errorsOf(UpdatePayrollSettingsDto, { regularHolidayMultiplier: 0.99 })).toEqual(['regularHolidayMultiplier']);
    expect(errorsOf(UpdatePayrollSettingsDto, { specialHolidayMultiplier: 5.01 })).toEqual(['specialHolidayMultiplier']);
    expect(errorsOf(UpdatePayrollSettingsDto, { specialHolidayMultiplier: 1.305 })).toEqual(['specialHolidayMultiplier']);
  });
});
```

Run: `npx jest src/server/payroll/dto/holiday.dto.spec.ts` — Expected: PASS (the DTO file was written in this step; this pins behaviour).

- [ ] **Step 3: Write the failing settings-service test**

`src/server/payroll/payroll-settings.service.spec.ts`:

```ts
import { PayrollSettingsService } from './payroll-settings.service';

describe('PayrollSettingsService', () => {
  let prisma: Record<string, any>;
  let service: PayrollSettingsService;

  beforeEach(() => {
    prisma = {
      payrollSettings: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 }),
        upsert: jest.fn().mockImplementation(({ update }) =>
          Promise.resolve({ id: 1, regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3, ...update }),
        ),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new PayrollSettingsService(prisma as never);
  });

  it('reads the multipliers', async () => {
    await expect(service.get()).resolves.toEqual({ regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 });
  });

  it('reads the defaults when the row is missing', async () => {
    prisma.payrollSettings.findUnique.mockResolvedValue(null);
    await expect(service.get()).resolves.toEqual({ regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 });
  });

  it('updates only what was sent, with no cutoff lock', async () => {
    const view = await service.update({ specialHolidayMultiplier: 1.5 }, 7);
    expect(prisma.payrollSettings.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      update: { specialHolidayMultiplier: 1.5, updatedById: 7 },
      create: { id: 1, specialHolidayMultiplier: 1.5, updatedById: 7 },
    });
    expect(view).toEqual({ regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.5 });
    expect(prisma.auditEvent.createMany).toHaveBeenCalled();
  });
});
```

Run: `npx jest src/server/payroll/payroll-settings.service.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `payroll-settings.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import { num } from '../common/utils/decimal.util';
import { UpdatePayrollSettingsDto } from './dto/holiday.dto';
import { readMultipliers } from './payroll-settings';

/**
 * The holiday multipliers. Drafts read them live; finalized payslips keep the
 * multiplier on each line, so a change here never touches history — which is
 * why writes take no cutoff lock.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const m = await readMultipliers(this.prisma);
    return { regularHolidayMultiplier: m.regular, specialHolidayMultiplier: m.special };
  }

  update(dto: UpdatePayrollSettingsDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.payrollSettings.findUnique({ where: { id: 1 } });
      const data = {
        ...(dto.regularHolidayMultiplier !== undefined && { regularHolidayMultiplier: dto.regularHolidayMultiplier }),
        ...(dto.specialHolidayMultiplier !== undefined && { specialHolidayMultiplier: dto.specialHolidayMultiplier }),
        updatedById: userId,
      };
      const after = await tx.payrollSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
      await recordChanges(tx, [{ entity: 'PayrollSettings', entityId: 1, before, after }], userId);
      return {
        regularHolidayMultiplier: num(after.regularHolidayMultiplier),
        specialHolidayMultiplier: num(after.specialHolidayMultiplier),
      };
    });
  }
}
```

Run: `npx jest src/server/payroll/payroll-settings.service.spec.ts` — Expected: PASS.

- [ ] **Step 5: Write the failing holidays-service tests**

`src/server/payroll/holidays.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HolidaysService } from './holidays.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

const holidayRow = (over: Record<string, unknown> = {}) => ({
  id: 90, date: at('2026-09-06'), name: 'Holiday', type: 'SPECIAL', isClosed: false, deletedAt: null, ...over,
});

describe('HolidaysService', () => {
  let prisma: Record<string, any>;
  let service: HolidaysService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      payrollRun: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(holidayRow()),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(holidayRow({ ...data, id: 91 }))),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(holidayRow(data))),
      },
      holidayRestDayWork: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 5 }),
        update: jest.fn().mockResolvedValue({ id: 5 }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-01-05'), separatedOn: null }),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new HolidaysService(prisma as never);
  });

  describe('list', () => {
    it('flags holidays whose cutoff is finalized', async () => {
      prisma.holiday.findMany.mockResolvedValue([holidayRow(), holidayRow({ id: 92, date: at('2026-09-20') })]);
      prisma.payrollRun.findMany.mockResolvedValue([{ periodStart: at('2026-09-01') }]);
      const rows = await service.list(2026);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, date: { gte: at('2026-01-01'), lte: at('2026-12-31') } },
        orderBy: { date: 'asc' },
      });
      expect(rows.map((r) => [r.date, r.locked])).toEqual([['2026-09-06', true], ['2026-09-20', false]]);
    });

    it('refuses a nonsense year', async () => {
      await expect(service.list(99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('creates an open holiday in an open cutoff, trimming the name', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      const view = await service.create({ date: '2026-12-25', name: ' Christmas Day ', type: 'REGULAR' }, 7);
      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: { date: at('2026-12-25'), name: 'Christmas Day', type: 'REGULAR', isClosed: false, createdById: 7 },
      });
      expect(view).toMatchObject({ id: 91, date: '2026-12-25', locked: false });
    });

    it('refuses a second live holiday on the same date', async () => {
      await expect(service.create({ date: '2026-09-06', name: 'Dup', type: 'REGULAR' }, 7)).rejects.toThrow(ConflictException);
    });

    it('refuses a finalized cutoff', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.create({ date: '2026-09-06', name: 'X', type: 'REGULAR' }, 7)).rejects.toThrow(ConflictException);
      expect(prisma.holiday.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('refuses to close a holiday that has rest-day marks', async () => {
      prisma.holidayRestDayWork.count.mockResolvedValue(1);
      await expect(service.update(90, { isClosed: true }, 7)).rejects.toThrow(ConflictException);
      expect(prisma.holiday.update).not.toHaveBeenCalled();
    });

    it('edits name and type in an open cutoff', async () => {
      await service.update(90, { name: 'Renamed', type: 'REGULAR' }, 7);
      expect(prisma.holiday.update).toHaveBeenCalledWith({ where: { id: 90 }, data: { name: 'Renamed', type: 'REGULAR', isClosed: undefined } });
    });

    it('refuses a finalized cutoff', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.update(90, { name: 'X' }, 7)).rejects.toThrow(ConflictException);
    });

    it('404s a deleted holiday', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.update(90, { name: 'X' }, 7)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes in an open cutoff', async () => {
      await service.remove(90, 7);
      expect(prisma.holiday.update.mock.calls[0][0]).toMatchObject({ where: { id: 90 }, data: { deletedAt: expect.any(Date) } });
    });

    it('refuses a finalized cutoff', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.remove(90, 7)).rejects.toThrow(ConflictException);
    });
  });

  describe('rest-day marks', () => {
    it('marks an employee who had the holiday as a rest day', async () => {
      await service.addRestDayWork(90, { employeeId: 1 }, 7); // Sep 6 2026 is a Sunday
      expect(prisma.holidayRestDayWork.create).toHaveBeenCalledWith({ data: { holidayId: 90, employeeId: 1, createdById: 7 } });
    });

    it('refuses a day that is not the employee’s rest day', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 1, restDays: [1], hiredOn: at('2026-01-05'), separatedOn: null });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
    });

    it('refuses a day outside the employment', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-09-10'), separatedOn: null });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
      prisma.employee.findFirst.mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-01-05'), separatedOn: at('2026-09-05') });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
    });

    it('refuses a closed holiday', async () => {
      prisma.holiday.findFirst.mockResolvedValue(holidayRow({ isClosed: true }));
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
    });

    it('refuses a duplicate live mark', async () => {
      prisma.holidayRestDayWork.findFirst.mockResolvedValue({ id: 5 });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(ConflictException);
    });

    it('refuses a finalized cutoff', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(ConflictException);
    });

    it('removes a mark while the cutoff is open', async () => {
      prisma.holidayRestDayWork.findFirst.mockResolvedValue({ id: 5, deletedAt: null, holiday: { date: at('2026-09-06') } });
      await service.removeRestDayWork(5, 7);
      expect(prisma.holidayRestDayWork.update.mock.calls[0][0]).toMatchObject({ where: { id: 5 }, data: { deletedAt: expect.any(Date) } });
    });

    it('refuses to remove a mark in a finalized cutoff', async () => {
      prisma.holidayRestDayWork.findFirst.mockResolvedValue({ id: 5, deletedAt: null, holiday: { date: at('2026-09-06') } });
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.removeRestDayWork(5, 7)).rejects.toThrow(ConflictException);
    });
  });
});
```

Run: `npx jest src/server/payroll/holidays.service.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 6: Implement `holidays.service.ts`**

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Holiday, Prisma } from '@prisma/client';
import { cutoffOf, weekdayOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { toUtcDay } from '../common/utils/date-range.util';
import { recordChanges } from '../common/utils/audit.util';
import { assertCutoffOpen, day } from './payroll-lock.util';
import { CreateHolidayDto, CreateRestDayWorkDto, UpdateHolidayDto } from './dto/holiday.dto';

function toHolidayView(h: Holiday, locked: boolean) {
  return { id: h.id, date: day(h.date), name: h.name, type: h.type, isClosed: h.isClosed, locked };
}

/**
 * Holidays and rest-day work marks. Every writer locks the cutoff containing
 * the holiday's date first (assertCutoffOpen), so a finalized cutoff's
 * holidays cannot change until its run is voided.
 */
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be between 2000 and 2100');
    }
    const [rows, runs] = await Promise.all([
      this.prisma.holiday.findMany({
        where: { deletedAt: null, date: { gte: toUtcDay(`${year}-01-01`), lte: toUtcDay(`${year}-12-31`) } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.payrollRun.findMany({
        where: { status: { not: 'VOIDED' }, periodStart: { gte: toUtcDay(`${year}-01-01`), lte: toUtcDay(`${year}-12-16`) } },
        select: { periodStart: true },
      }),
    ]);
    const finalized = new Set(runs.map((r) => day(r.periodStart)));
    return rows.map((h) => toHolidayView(h, finalized.has(cutoffOf(day(h.date)).periodStart)));
  }

  create(dto: CreateHolidayDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await assertCutoffOpen(tx, cutoffOf(dto.date).periodStart);
      const clash = await tx.holiday.findFirst({ where: { date: toUtcDay(dto.date), deletedAt: null } });
      if (clash) throw new ConflictException(`${dto.date} already has a holiday (${clash.name})`);
      const created = await tx.holiday.create({
        data: {
          date: toUtcDay(dto.date),
          name: dto.name.trim(),
          type: dto.type,
          isClosed: dto.isClosed ?? false,
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'Holiday', entityId: created.id, before: null, after: created }], userId);
      return toHolidayView(created, false);
    });
  }

  update(id: number, dto: UpdateHolidayDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireHoliday(tx, id);
      await assertCutoffOpen(tx, cutoffOf(day(before.date)).periodStart);
      if (dto.isClosed === true && !before.isClosed) {
        const marks = await tx.holidayRestDayWork.count({ where: { holidayId: id, deletedAt: null } });
        if (marks > 0) {
          throw new ConflictException('Remove the rest-day work marks first: a closed holiday was worked by nobody');
        }
      }
      const after = await tx.holiday.update({
        where: { id },
        data: { name: dto.name?.trim(), type: dto.type, isClosed: dto.isClosed },
      });
      await recordChanges(tx, [{ entity: 'Holiday', entityId: id, before, after }], userId);
      return toHolidayView(after, false);
    });
  }

  remove(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireHoliday(tx, id);
      await assertCutoffOpen(tx, cutoffOf(day(before.date)).periodStart);
      const after = await tx.holiday.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'Holiday', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }

  addRestDayWork(holidayId: number, dto: CreateRestDayWorkDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const holiday = await this.requireHoliday(tx, holidayId);
      const date = day(holiday.date);
      await assertCutoffOpen(tx, cutoffOf(date).periodStart);
      if (holiday.isClosed) throw new BadRequestException('Nobody works a closed holiday');
      const employee = await tx.employee.findFirst({ where: { id: dto.employeeId, deletedAt: null } });
      if (!employee) throw new NotFoundException('Employee not found');
      const employed = day(employee.hiredOn) <= date && (employee.separatedOn === null || day(employee.separatedOn) >= date);
      if (!employed) throw new BadRequestException(`The employee was not employed on ${date}`);
      if (!employee.restDays.includes(weekdayOf(date))) {
        throw new BadRequestException(`${date} is not this employee's rest day`);
      }
      const existing = await tx.holidayRestDayWork.findFirst({
        where: { holidayId, employeeId: dto.employeeId, deletedAt: null },
      });
      if (existing) throw new ConflictException('Already marked as worked');
      const created = await tx.holidayRestDayWork.create({
        data: { holidayId, employeeId: dto.employeeId, createdById: userId },
      });
      await recordChanges(tx, [{ entity: 'HolidayRestDayWork', entityId: created.id, before: null, after: created }], userId);
      return { id: created.id };
    });
  }

  removeRestDayWork(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.holidayRestDayWork.findFirst({
        where: { id, deletedAt: null },
        include: { holiday: { select: { date: true } } },
      });
      if (!before) throw new NotFoundException('Mark not found');
      await assertCutoffOpen(tx, cutoffOf(day(before.holiday.date)).periodStart);
      const after = await tx.holidayRestDayWork.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'HolidayRestDayWork', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }

  private async requireHoliday(tx: Prisma.TransactionClient, id: number) {
    const holiday = await tx.holiday.findFirst({ where: { id, deletedAt: null } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }
}
```

Run: `npx jest src/server/payroll/holidays.service.spec.ts` — Expected: PASS.

- [ ] **Step 7: Controller, module, authorization tests**

`src/server/payroll/holidays.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { manilaToday } from '@/lib/manilaDate';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { HolidaysService } from './holidays.service';
import { PayrollSettingsService } from './payroll-settings.service';
import { CreateHolidayDto, CreateRestDayWorkDto, UpdateHolidayDto, UpdatePayrollSettingsDto } from './dto/holiday.dto';

type Actor = { id: number };

/** Holidays, rest-day marks and multipliers. Admin-only, reads included, like the rest of payroll. */
@Controller('payroll')
@Roles(UserRole.ADMIN)
@RequireFeature('payroll')
export class HolidaysController {
  constructor(
    private readonly holidays: HolidaysService,
    private readonly settings: PayrollSettingsService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdatePayrollSettingsDto, @CurrentUser() user: Actor) {
    return this.settings.update(dto, user.id);
  }

  @Get('holidays')
  list(@Query('year') year?: string) {
    return this.holidays.list(year ? Number(year) : Number(manilaToday().slice(0, 4)));
  }

  @Post('holidays')
  create(@Body() dto: CreateHolidayDto, @CurrentUser() user: Actor) {
    return this.holidays.create(dto, user.id);
  }

  @Patch('holidays/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHolidayDto, @CurrentUser() user: Actor) {
    return this.holidays.update(id, dto, user.id);
  }

  @Delete('holidays/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.holidays.remove(id, user.id);
  }

  @Post('holidays/:id/rest-day-work')
  addRestDayWork(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateRestDayWorkDto, @CurrentUser() user: Actor) {
    return this.holidays.addRestDayWork(id, dto, user.id);
  }

  @Delete('rest-day-work/:id')
  removeRestDayWork(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor) {
    return this.holidays.removeRestDayWork(id, user.id);
  }
}
```

`payroll.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { PayrollController } from './payroll.controller';
import { PayrollDraftService } from './payroll-draft.service';
import { PayrollInputsService } from './payroll-inputs.service';
import { PayrollRunsService } from './payroll-runs.service';
import { PayrollSettingsService } from './payroll-settings.service';

@Module({
  controllers: [PayrollController, HolidaysController],
  providers: [PayrollDraftService, PayrollInputsService, PayrollRunsService, HolidaysService, PayrollSettingsService],
})
export class PayrollModule {}
```

`rbac-matrix.spec.ts`:
- import: `import { HolidaysController } from '../../payroll/holidays.controller';`
- after the `'read payslip'` row add:
  ```ts
  ['payroll holidays',     { controller: HolidaysController, method: 'list' },           [D, D, D, A]],
  ['payroll multipliers',  { controller: HolidaysController, method: 'updateSettings' }, [D, D, D, A]],
  ```
- add `[HolidaysController, 'payroll'],` to `PAYROLL_CONTROLLERS`.

`src/server/payroll/holidays.authz.http.spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ROLE_DEFAULTS, type RoleName } from '@/lib/rbac/features';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { PayrollSettingsService } from './payroll-settings.service';

/** The holiday routes through a real Nest stack with the real global guards and pipe. */
async function bootAs(role: RoleName, permissions: readonly string[] = ROLE_DEFAULTS[role]) {
  const holidays = { list: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) };
  const moduleRef = await Test.createTestingModule({
    controllers: [HolidaysController],
    providers: [
      { provide: HolidaysService, useValue: holidays },
      { provide: PayrollSettingsService, useValue: { get: jest.fn().mockResolvedValue({}) } },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: FeatureGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 1, role, permissions: [...permissions] };
    next();
  });
  await app.init();
  return { app, holidays };
}

describe('payroll holidays over HTTP', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('refuses a VIEWER before loading anything', async () => {
    const booted = await bootAs('VIEWER');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/holidays?year=2026').expect(403);
    expect(booted.holidays.list).not.toHaveBeenCalled();
  });

  it('refuses a MANAGER even with the payroll key granted', async () => {
    const booted = await bootAs('MANAGER', [...ROLE_DEFAULTS.MANAGER, 'payroll']);
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/settings').expect(403);
  });

  it('serves an ADMIN', async () => {
    const booted = await bootAs('ADMIN');
    app = booted.app;
    await request(app.getHttpServer()).get('/payroll/holidays?year=2026').expect(200);
    expect(booted.holidays.list).toHaveBeenCalledWith(2026);
  });

  it('refuses a date change on PATCH instead of ignoring it', async () => {
    const booted = await bootAs('ADMIN');
    app = booted.app;
    await request(app.getHttpServer()).patch('/payroll/holidays/90').send({ date: '2026-12-26' }).expect(400);
    expect(booted.holidays.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run the server suites**

Run: `npx jest src/server/payroll src/server/common/guards/rbac-matrix.spec.ts` then `npx tsc --noEmit -p .`
Expected: PASS; tsc exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/server/common/utils/audit.util.ts src/server/payroll src/server/common/guards/rbac-matrix.spec.ts
git commit -m "feat(payroll): holidays, rest-day marks and multiplier endpoints"
```

---

### Task 4: Frontend types, API client, payslip and cutoff table

**Files:**
- Modify: `src/types/index.ts` (payroll block, ~lines 912–1009)
- Modify: `src/lib/apiServices.ts` (`payrollApi`, ~line 544; the type import on line 6)
- Modify: `src/app/(app)/payroll/_components/PayslipView.tsx`
- Modify: `src/app/(app)/payroll/_components/CutoffTable.tsx`
- Test: `src/app/(app)/payroll/_components/PayslipView.spec.tsx`, create `src/app/(app)/payroll/_components/CutoffTable.spec.tsx`

**Interfaces:**
- Consumes: the HTTP shapes from Task 3 and `getCutoff`'s `holidays` from Task 2.
- Produces (Tasks 5–6 use these):
  ```ts
  export type HolidayType = 'REGULAR' | 'SPECIAL';
  export interface PayrollHoliday { id: number; date: string; name: string; type: HolidayType; isClosed: boolean; locked: boolean }
  export interface PayrollHolidayInput { date: string; name: string; type: HolidayType; isClosed?: boolean }
  export interface PayrollSettings { regularHolidayMultiplier: number; specialHolidayMultiplier: number }
  export interface CutoffHoliday { id: number; date: string; name: string; type: HolidayType; isClosed: boolean;
    restDayEmployees: { employeeId: number; employeeName: string; markId: number | null }[] }
  payrollApi.settings / updateSettings / holidays / createHoliday / updateHoliday / removeHoliday / markRestDayWork / unmarkRestDayWork
  ```

- [ ] **Step 1: Types**

In `src/types/index.ts`:
- `PayslipLineView.type`: `'BASIC' | 'HOLIDAY' | 'ADDITION' | 'DEDUCTION' | 'EMPLOYER_SHARE'`
- `PayslipWarning`: add `| { code: 'IGNORED_REST_DAY_MARK'; blocking: false; dates: string[] }`
- Add `holidayPay: number;` after `basicPay` in both `DraftPayslip` and `PayslipRecord`.
- `CutoffView`: add `holidays: CutoffHoliday[];`
- Before `// ─── Branch cash`, add the five types from **Produces** above.

- [ ] **Step 2: API client**

Add `CutoffHoliday, PayrollHoliday, PayrollHolidayInput, PayrollSettings` to the type import on line 6 of `apiServices.ts` (keep alphabetical-ish order as the line has it), and inside `payrollApi` after `payslip`:

```ts
  settings: () => api.get<PayrollSettings>('/payroll/settings'),
  updateSettings: (data: Partial<PayrollSettings>) => api.patch<PayrollSettings>('/payroll/settings', data),
  holidays: (year: number) => api.get<PayrollHoliday[]>('/payroll/holidays', { params: { year } }),
  createHoliday: (data: PayrollHolidayInput) => api.post<PayrollHoliday>('/payroll/holidays', data),
  updateHoliday: (id: number, data: Partial<Omit<PayrollHolidayInput, 'date'>>) =>
    api.patch<PayrollHoliday>(`/payroll/holidays/${id}`, data),
  removeHoliday: (id: number) => api.delete(`/payroll/holidays/${id}`),
  markRestDayWork: (holidayId: number, employeeId: number) =>
    api.post<{ id: number }>(`/payroll/holidays/${holidayId}/rest-day-work`, { employeeId }),
  unmarkRestDayWork: (id: number) => api.delete(`/payroll/rest-day-work/${id}`),
```

(`CutoffHoliday` is imported for Task 6; if lint flags it unused here, import it in Task 6 instead.)

- [ ] **Step 3: Write the failing frontend tests**

In `PayslipView.spec.tsx`, add `holidayPay: 0,` after `basicPay` in the `slip` fixture, and add:

```ts
  it('shows holiday lines in their own section with a total', () => {
    const withHoliday: PayslipRecord = {
      ...slip,
      holidayPay: 1200,
      netPay: 8950,
      lines: [
        slip.lines[0],
        { type: 'HOLIDAY', label: 'Regular holiday — Sep 8 (worked)', quantity: 2, rate: 600, amount: 1200, sourceType: 'Holiday', sourceId: 90 },
        ...slip.lines.slice(1),
      ],
    };
    render(<PayslipView slip={withHoliday} run={run} />);
    expect(screen.getByText('Regular holiday — Sep 8 (worked)')).toBeInTheDocument();
    expect(screen.getByText(/2\.00 × ₱600\.00/)).toBeInTheDocument();
    expect(screen.getByText('Total holiday pay')).toBeInTheDocument();
    expect(screen.getByTestId('net-pay')).toHaveTextContent('8,950.00');
  });

  it('leaves the holiday section out when there were no holidays', () => {
    render(<PayslipView slip={slip} run={run} />);
    expect(screen.queryByText('Total holiday pay')).toBeNull();
  });
```

Create `CutoffTable.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CutoffTable, type SlipRow } from './CutoffTable';

const row: SlipRow = {
  employeeId: 1,
  employeeName: 'Ana Cruz',
  jobRoleName: 'Baker',
  branchName: null,
  workingDays: 13,
  absenceDays: 0,
  daysWorked: 13,
  basicPay: 7200,
  holidayPay: 1200,
  totalAdditions: 0,
  totalDeductions: 0,
  netPay: 8400,
  lines: [],
  warnings: [{ code: 'IGNORED_REST_DAY_MARK', blocking: false, dates: ['2026-09-08'] }],
};

describe('CutoffTable', () => {
  it('labels an ignored rest-day mark as such, not as "no days worked"', () => {
    render(<CutoffTable rows={[row]} />);
    expect(screen.getAllByText(/rest-day mark ignored/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/no days worked/i)).toBeNull();
  });

  it('shows the holiday pay column', () => {
    render(<CutoffTable rows={[row]} />);
    expect(screen.getByRole('columnheader', { name: 'Holiday' })).toBeInTheDocument();
    expect(screen.getByText('₱1,200.00')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run "src/app/(app)/payroll/_components"` — Expected: FAIL.

- [ ] **Step 4: Implement `PayslipView.tsx`**

1. In `Section`, replace the BASIC-only detail span with:

```tsx
              {l.type === 'BASIC' && l.quantity !== null && l.rate !== null && (
                <span className="text-neutral-500"> ({l.quantity} days × {peso(l.rate)})</span>
              )}
              {l.type === 'HOLIDAY' && l.quantity !== null && l.rate !== null && (
                <span className="text-neutral-500"> ({l.quantity.toFixed(2)} × {peso(l.rate)})</span>
              )}
```

2. In `PayslipView`, add `const holidays = slip.lines.filter((l) => l.type === 'HOLIDAY');` and render between Earnings and Deductions:

```tsx
      {holidays.length > 0 && <Section title="Holiday pay" lines={holidays} total={slip.holidayPay} />}
```

(`Section` prints "Total holiday pay" from the title.)

- [ ] **Step 5: Implement `CutoffTable.tsx`**

1. `SlipRow`: add `holidayPay: number;` after `basicPay`.
2. `WarningBadges`: replace the final `: (` branch with an explicit chain:

```tsx
        ) : w.code === 'IGNORED_REST_DAY_MARK' ? (
          <Badge key={w.code} variant="secondary">Rest-day mark ignored ({w.dates.length})</Badge>
        ) : (
          <Badge key={w.code} variant="secondary">No days worked</Badge>
        ),
```

3. `lineLabel`: add before the final return:

```ts
  if (l.type === 'HOLIDAY' && l.quantity !== null && l.rate !== null) {
    return `${l.label} — ${l.quantity.toFixed(2)} × ${peso(l.rate)}`;
  }
```

4. Desktop table: add `<TableHead className="text-right">Holiday</TableHead>` after the Basic head, `<TableCell className="text-right tabular-nums">{peso(row.holidayPay)}</TableCell>` after the basic cell, and change the details row's `colSpan={8}` to `colSpan={9}`.

The finalized-run rows (`data.run.payslips`) already carry `holidayPay` from the API (Task 2), so `[periodStart]/page.tsx` needs no change for this step.

- [ ] **Step 6: Run the frontend tests and type-check**

Run: `npx vitest run "src/app/(app)/payroll"` then `npx tsc --noEmit -p .`
Expected: PASS; exit 0. (If other vitest fixtures construct `DraftPayslip`/`PayslipRecord` — e.g. `FinalizeBar.spec.tsx` — add `holidayPay: 0` to them.)

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/lib/apiServices.ts "src/app/(app)/payroll/_components"
git commit -m "feat(payroll): show holiday pay on payslips and the cutoff table"
```

---

### Task 5: Settings → Payroll page

**Files:**
- Modify: `src/lib/rbac/features.ts` (the `payroll` feature, ~line 681)
- Test: `src/lib/rbac/features.spec.ts`
- Create: `src/app/(app)/settings/payroll/page.tsx`
- Create: `src/app/(app)/settings/payroll/_components/MultipliersCard.tsx`
- Create: `src/app/(app)/settings/payroll/_components/HolidaysCard.tsx`
- Create: `src/app/(app)/settings/payroll/_components/HolidaysCard.spec.tsx`
- Modify: `src/app/(app)/payroll/page.tsx`

**Interfaces:**
- Consumes: `payrollApi.settings/updateSettings/holidays/createHoliday/updateHoliday/removeHoliday`, `PayrollHoliday`, `PayrollSettings`, `HolidayType` (Task 4).
- Produces: route `/settings/payroll`, gated by feature `payroll`.

UI rules (shadcn skill + surrounding code): reuse `Card`, `Table`, `Dialog`, `Input`, `Label`, `Select`, `Switch`, `Badge`, `Button` from `@/components/ui`; semantic colours only; match the payroll screens' existing `div className="space-y-2"` form layout (the codebase does not use `Field`).

- [ ] **Step 1: Route the page to the payroll feature (failing test first)**

In `features.spec.ts`, next to the `/settings/jobs` assertions, add:

```ts
      expect(featureForPath('/settings/payroll')?.key).toBe('payroll');
```

Run: `npx vitest run src/lib/rbac/features.spec.ts` — Expected: FAIL. Then in `features.ts` change the payroll feature's `routes: ['/payroll']` to `routes: ['/payroll', '/settings/payroll']`. Re-run — Expected: PASS.

- [ ] **Step 2: `MultipliersCard.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { payrollApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/** Whole percent, 100–500: a multiplier of 1.00–5.00 with two decimals. */
const PERCENT = /^\d{3}$/;
const toPercent = (m: number) => String(Math.round(m * 100));
const validPercent = (v: string) => PERCENT.test(v) && Number(v) >= 100 && Number(v) <= 500;

export function MultipliersCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['payroll', 'settings'],
    queryFn: () => payrollApi.settings().then((r) => r.data),
  });
  const [regular, setRegular] = useState('');
  const [special, setSpecial] = useState('');
  useEffect(() => {
    if (data) {
      setRegular(toPercent(data.regularHolidayMultiplier));
      setSpecial(toPercent(data.specialHolidayMultiplier));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      payrollApi.updateSettings({
        regularHolidayMultiplier: Number(regular) / 100,
        specialHolidayMultiplier: Number(special) / 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Multipliers saved');
    },
    onError: (err) => toast.error(extractError(err)),
  });

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;
  const valid = validPercent(regular) && validPercent(special);

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-semibold">Holiday multipliers</h2>
        <p className="text-sm text-muted-foreground">
          Pay for a worked holiday, as a percentage of the daily rate. Applies to drafts; finalized payslips keep the rate they used.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="regular-multiplier">Regular holiday worked (%)</Label>
          <Input id="regular-multiplier" inputMode="numeric" value={regular} onChange={(e) => setRegular(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="special-multiplier">Special holiday worked (%)</Label>
          <Input id="special-multiplier" inputMode="numeric" value={special} onChange={(e) => setSpecial(e.target.value)} />
        </div>
      </div>
      {!valid && <p className="text-sm text-destructive">Enter a whole percentage from 100 to 500.</p>}
      <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>Save multipliers</Button>
    </Card>
  );
}
```

- [ ] **Step 3: Write the failing `HolidaysCard` test**

`HolidaysCard.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { HolidaysTable } from './HolidaysCard';

const rows = [
  { id: 90, date: '2026-09-08', name: 'Open day', type: 'REGULAR' as const, isClosed: false, locked: false },
  { id: 91, date: '2026-09-01', name: 'Past day', type: 'SPECIAL' as const, isClosed: true, locked: true },
];

function renderTable() {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HolidaysTable rows={rows} onEdit={onEdit} onDelete={onDelete} />
    </QueryClientProvider>,
  );
  return { onEdit, onDelete };
}

describe('HolidaysTable', () => {
  it('shows type and open/closed for each holiday', () => {
    renderTable();
    expect(screen.getByText('Open day')).toBeInTheDocument();
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('offers no actions on a holiday in a finalized cutoff', () => {
    renderTable();
    expect(screen.getByRole('button', { name: 'Edit Open day' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Past day' })).toBeNull();
    expect(screen.getByLabelText('Past day is in a finalized cutoff')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run "src/app/(app)/settings/payroll"` — Expected: FAIL (module not found).

- [ ] **Step 4: `HolidaysCard.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { HolidayType, PayrollHoliday } from '@/types';
import { payrollApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { manilaToday } from '@/lib/manilaDate';
import { isCalendarDate } from '@/lib/payroll/cutoff';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const TYPE_LABEL: Record<HolidayType, string> = { REGULAR: 'Regular', SPECIAL: 'Special' };

export function HolidaysTable({
  rows,
  onEdit,
  onDelete,
}: {
  rows: PayrollHoliday[];
  onEdit: (h: PayrollHoliday) => void;
  onDelete: (h: PayrollHoliday) => void;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">No holidays this year.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Bakery</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((h) => (
          <TableRow key={h.id}>
            <TableCell className="tabular-nums">{h.date}</TableCell>
            <TableCell>{h.name}</TableCell>
            <TableCell><Badge variant={h.type === 'REGULAR' ? 'default' : 'secondary'}>{TYPE_LABEL[h.type]}</Badge></TableCell>
            <TableCell>{h.isClosed ? 'Closed' : 'Open'}</TableCell>
            <TableCell className="text-right">
              {h.locked ? (
                <Lock className="ml-auto size-4 text-muted-foreground" aria-label={`${h.name} is in a finalized cutoff`} />
              ) : (
                <span className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${h.name}`} onClick={() => onEdit(h)}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Delete ${h.name}`} onClick={() => onDelete(h)}>
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HolidayDialog({ holiday, onClose }: { holiday: PayrollHoliday | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = holiday !== null;
  const [date, setDate] = useState(holiday?.date ?? manilaToday());
  const [name, setName] = useState(holiday?.name ?? '');
  const [type, setType] = useState<HolidayType>(holiday?.type ?? 'REGULAR');
  const [isClosed, setIsClosed] = useState(holiday?.isClosed ?? false);
  const valid = name.trim() !== '' && isCalendarDate(date);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? payrollApi.updateHoliday(holiday.id, { name: name.trim(), type, isClosed })
        : payrollApi.createHoliday({ date, name: name.trim(), type, isClosed }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast.success('Holiday saved');
      onClose();
    },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{editing ? 'Edit holiday' : 'Add holiday'}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="holiday-date">Date</Label>
            <Input id="holiday-date" type="date" value={date} disabled={editing} onChange={(e) => setDate(e.target.value)} />
            {editing && <p className="text-xs text-muted-foreground">To move a holiday, delete it and add it again.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="holiday-name">Name</Label>
            <Input id="holiday-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as HolidayType)}>
              <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="REGULAR">Regular holiday</SelectItem>
                <SelectItem value="SPECIAL">Special holiday</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="holiday-closed">Bakery closed this day</Label>
            <Switch id="holiday-closed" checked={isClosed} onCheckedChange={setIsClosed} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function HolidaysCard() {
  const qc = useQueryClient();
  const [year, setYear] = useState(() => Number(manilaToday().slice(0, 4)));
  const [dialog, setDialog] = useState<{ holiday: PayrollHoliday | null } | null>(null);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['payroll', 'holidays', year],
    queryFn: () => payrollApi.holidays(year).then((r) => r.data),
  });
  const remove = useMutation({
    mutationFn: (id: number) => payrollApi.removeHoliday(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll'] }); toast.success('Holiday deleted'); },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Holidays</h2>
          <p className="text-sm text-muted-foreground">Open by default. Mark a holiday closed only if the bakery did not operate.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}><ChevronLeft className="size-4" /></Button>
          <span className="w-12 text-center font-semibold">{year}</span>
          <Button variant="ghost" size="icon" aria-label="Next year" onClick={() => setYear((y) => y + 1)}><ChevronRight className="size-4" /></Button>
          <Button size="sm" onClick={() => setDialog({ holiday: null })}><Plus className="mr-1 size-4" />Add holiday</Button>
        </div>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <HolidaysTable
          rows={rows}
          onEdit={(h) => setDialog({ holiday: h })}
          onDelete={(h) => { if (window.confirm(`Delete ${h.name} (${h.date})?`)) remove.mutate(h.id); }}
        />
      )}
      {dialog && <HolidayDialog holiday={dialog.holiday} onClose={() => setDialog(null)} />}
    </Card>
  );
}
```

(If `isCalendarDate` is not exported for client use from `@/lib/payroll/cutoff`, it is — line 24 of that file.)

- [ ] **Step 5: The page and the link**

`src/app/(app)/settings/payroll/page.tsx`:

```tsx
'use client';

import { usePageHeader } from '@/components/layout/usePageHeader';
import { HolidaysCard } from './_components/HolidaysCard';
import { MultipliersCard } from './_components/MultipliersCard';

export default function PayrollSettingsPage() {
  usePageHeader({ title: 'Payroll settings' });
  return (
    <div className="flex flex-col gap-4">
      <MultipliersCard />
      <HolidaysCard />
    </div>
  );
}
```

In `src/app/(app)/payroll/page.tsx`, turn the year-picker row into a spaced row with a link on the right:

```tsx
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* the three existing year-picker elements, unchanged */}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/payroll">Holidays &amp; multipliers</Link>
        </Button>
      </div>
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run "src/app/(app)/settings/payroll" src/lib/rbac` then `npx tsc --noEmit -p .` and `npx eslint "src/app/(app)/settings/payroll" "src/app/(app)/payroll" src/lib/rbac`
Expected: PASS (including `screen-dependencies.spec.ts`, which checks the new screen can reach `payrollApi`); exit 0; no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rbac "src/app/(app)/settings/payroll" "src/app/(app)/payroll/page.tsx"
git commit -m "feat(payroll): Settings → Payroll page for holidays and multipliers"
```

---

### Task 6: Holidays panel on the cutoff page

**Files:**
- Create: `src/app/(app)/payroll/_components/HolidaysPanel.tsx`
- Create: `src/app/(app)/payroll/_components/HolidaysPanel.spec.tsx`
- Modify: `src/app/(app)/payroll/[periodStart]/page.tsx`

**Interfaces:**
- Consumes: `CutoffView.holidays: CutoffHoliday[]`, `payrollApi.markRestDayWork(holidayId, employeeId)`, `payrollApi.unmarkRestDayWork(markId)` (Task 4).
- Produces: `HolidaysPanel({ holidays, editable, busy, onToggle })`.

- [ ] **Step 1: Write the failing test**

`HolidaysPanel.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CutoffHoliday } from '@/types';
import { HolidaysPanel } from './HolidaysPanel';

const open: CutoffHoliday = {
  id: 91, date: '2026-09-06', name: 'Sun holiday', type: 'SPECIAL', isClosed: false,
  restDayEmployees: [
    { employeeId: 1, employeeName: 'Ana Cruz', markId: 5 },
    { employeeId: 2, employeeName: 'Ben Diaz', markId: null },
  ],
};

describe('HolidaysPanel', () => {
  it('renders nothing without holidays', () => {
    const { container } = render(<HolidaysPanel holidays={[]} editable busy={false} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles a rest-day employee’s Worked mark', () => {
    const onToggle = vi.fn();
    render(<HolidaysPanel holidays={[open]} editable busy={false} onToggle={onToggle} />);
    expect(screen.getByRole('switch', { name: 'Ana Cruz worked Sun holiday' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Ben Diaz worked Sun holiday' }));
    expect(onToggle).toHaveBeenCalledWith(open, open.restDayEmployees[1]);
  });

  it('disables the toggles on a closed holiday', () => {
    render(<HolidaysPanel holidays={[{ ...open, isClosed: true }]} editable busy={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Ben Diaz worked Sun holiday' })).toBeDisabled();
  });

  it('disables the toggles on a finalized cutoff', () => {
    render(<HolidaysPanel holidays={[open]} editable={false} busy={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('switch', { name: 'Ben Diaz worked Sun holiday' })).toBeDisabled();
  });
});
```

Run: `npx vitest run "src/app/(app)/payroll/_components/HolidaysPanel.spec.tsx"` — Expected: FAIL.

- [ ] **Step 2: Implement `HolidaysPanel.tsx`**

```tsx
'use client';

import type { CutoffHoliday } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

type RestDayEmployee = CutoffHoliday['restDayEmployees'][number];

/**
 * The cutoff's holidays. Employees scheduled that day are paid automatically;
 * only those on their rest day need a mark, and only if they came in.
 */
export function HolidaysPanel({
  holidays,
  editable,
  busy,
  onToggle,
}: {
  holidays: CutoffHoliday[];
  /** False once the cutoff is finalized. */
  editable: boolean;
  busy: boolean;
  onToggle: (holiday: CutoffHoliday, employee: RestDayEmployee) => void;
}) {
  if (holidays.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold">Holidays in this cutoff</h2>
      {holidays.map((h) => (
        <div key={h.id} className="flex flex-col gap-2 border-t pt-3 first-of-type:border-t-0 first-of-type:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{h.name}</span>
            <span className="text-sm text-muted-foreground tabular-nums">{h.date}</span>
            <Badge variant={h.type === 'REGULAR' ? 'default' : 'secondary'}>{h.type === 'REGULAR' ? 'Regular' : 'Special'}</Badge>
            {h.isClosed && <Badge variant="outline">Closed</Badge>}
          </div>
          {h.restDayEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody had this day as a rest day.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">On rest day — switch on if they came in to work:</p>
              {h.restDayEmployees.map((e) => (
                <div key={e.employeeId} className="flex items-center justify-between gap-2">
                  <span>{e.employeeName}</span>
                  <Switch
                    checked={e.markId !== null}
                    disabled={!editable || h.isClosed || busy}
                    onCheckedChange={() => onToggle(h, e)}
                    aria-label={`${e.employeeName} worked ${h.name}`}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 3: Wire it into the cutoff page**

In `src/app/(app)/payroll/[periodStart]/page.tsx`:

1. Imports: add `CutoffHoliday` to the `@/types` import and `import { HolidaysPanel } from '../_components/HolidaysPanel';`.
2. After `toggleSkip`, add:

```tsx
  const toggleRestDayWork = useMutation({
    mutationFn: ({ holiday, employee }: { holiday: CutoffHoliday; employee: CutoffHoliday['restDayEmployees'][number] }) =>
      employee.markId !== null
        ? payrollApi.unmarkRestDayWork(employee.markId)
        : payrollApi.markRestDayWork(holiday.id, employee.employeeId),
    onSuccess: refresh,
    onError,
  });
```

3. Add `|| toggleRestDayWork.isPending` to `busy`.
4. Directly after the header `div` (before `{data.draft && (`), render:

```tsx
      <HolidaysPanel
        holidays={data.holidays}
        editable={data.status === 'OPEN'}
        busy={busy}
        onToggle={(holiday, employee) => toggleRestDayWork.mutate({ holiday, employee })}
      />
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run "src/app/(app)/payroll"` then `npx tsc --noEmit -p .` and `npx eslint "src/app/(app)/payroll"`
Expected: PASS; exit 0; clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/payroll"
git commit -m "feat(payroll): holidays panel with rest-day Worked toggles on the cutoff page"
```

---

### Task 7: Docs, full verification, migration hand-off

**Files:**
- Modify: `AGENTS.md` (the `### Payroll` section)

- [ ] **Step 1: Document the rules**

In `AGENTS.md` under `### Payroll`:
- Replace the pay bullet with:
  `- **Pay = daily rate × days worked + holiday pay + additions − deductions.** Everyone is present on every non-rest working day unless an \`Absence\` says otherwise. Rates are dated history (\`EmployeeRate\`); a mid-cutoff raise splits basic pay.`
- Add after it:
  ```
  - **Holidays** (spec: `docs/superpowers/specs/2026-09-29-payroll-holidays-design.md`)
    are admin-set per date (`Holiday`, REGULAR or SPECIAL, open unless closed).
    Worked → daily rate × the type's multiplier (`PayrollSettings`, Settings →
    Payroll, drafts only); absent or closed on a scheduled day → nothing; rest
    day → 100%, or the multiplier if marked worked (`HolidayRestDayWork`).
    Holidays and marks lock with their cutoff.
  ```

- [ ] **Step 2: Full verification**

Run, in order:
```bash
npx tsc --noEmit -p .
npm run lint
npm run test
```
Expected: tsc exit 0; lint clean; every vitest file and jest suite passes. Paste the summary lines (`Test Files …`, `Test Suites …`, `Tests …`) into the hand-off.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document payroll holiday rules"
```

- [ ] **Step 4: Migration hand-off — STOP and ask**

The migration `20261003100000_payroll_holidays` is committed but **not applied**. The local `.env` points at production. Ask the user before running:

```bash
npx prisma migrate status   # read-only; expect only the pending holiday migration (and 20261002110000_employee_government_ids if still pending)
npm run prisma:deploy
```

The deployed app will fail on payroll reads (`holiday`, `payrollSettings` tables missing) until this migration is applied, so it must be applied before or with the deploy that ships this code.
