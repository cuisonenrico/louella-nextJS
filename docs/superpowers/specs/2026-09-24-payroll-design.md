# Payroll management — design

Date: 2026-09-24
Status: draft, awaiting review

## 1. Intent

Admins keep a register of the bakery's employees and pay them twice a month.
Payroll is computed by the app from each employee's daily rate and the days
they worked, with recurring statutory deductions and one-off additions and
deductions entered by the admin. Finalized payroll is a frozen financial record
and prints as payslips.

Success looks like: an admin opens a cutoff, sees every employee's net pay
already computed, corrects absences and one-off items, finalizes, prints
payslips, and marks the run paid — without a spreadsheet.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Role model | An employee's **job role** (Baker, Cashier…) is separate from the login **access level** (`UserRole`). |
| Logins | An employee may have no login. The admin may create or link one; access level is capped at `MANAGER` from this flow. |
| Pay basis | **Daily rate only.** Pay = daily rate × days worked + additions − deductions. |
| Pay periods | Semi-monthly cutoffs: 1st–15th and 16th–last day, Manila calendar. |
| Working days | Per-employee rest days. Everyone is assumed present on every working day. |
| Absences | Admin records absences as exceptions, at any time. Whole days only. |
| Timekeeping | Out of scope (future enhancement). |
| Statutory deductions | Entered per employee as fixed **monthly** amounts (employee share + employer share). No government tables. |
| When recurring deductions apply | Once a month, in full, on the **1–15 cutoff** only. |
| Withholding tax | Out of scope — handled outside the app. |
| One-off items | Admin adds additions (overtime, bonus, holiday, allowance) and deductions (offense, other) per cutoff. |
| Zero days worked | Recurring deductions still apply; admin may skip one per cutoff with a manual toggle. |
| Lifecycle | Draft (computed live, never stored) → Finalized (snapshot) → Paid. Mistakes are fixed by voiding and re-finalizing. |
| Access | Admin only. |
| Payslips | Printable per employee and per run, via the browser. |
| Remittance summary | Out of scope. |

### Out of scope

Timekeeping / clock-in, withholding tax, government contribution tables,
13th-month pay, remittance reports, employee self-service payslip viewing,
manager access to their branch's payroll, holidays as a calendar (holiday pay
is an addition), half-day absences, bank export.

## 2. Architecture

Two new NestJS modules in `src/server/`, following the existing
module/controller/service/`dto` layout:

- **`employees`** — employees, job roles, rates, recurring deductions,
  absences, login linking.
- **`payroll`** — one-off adjustments, draft computation, runs, payslips.

An `Employee` is a new table. It links to `User` through an optional, unique
`userId`. `User` is not changed, and no auth path needs to know employees
exist.

A single pure function computes a payslip. The draft endpoint and the
finalize endpoint both call it, so the two cannot disagree. Drafts are never
stored; only finalize writes rows.

## 3. Data model

Conventions: money is `Decimal(12,2)`, read through `num()` and summed in
centavos (`common/utils/decimal.util.ts`). Calendar dates are Manila days
stored as `@db.Date`. Nothing is hard-deleted: records carry `deletedAt` or a
status.

### People

**`JobRole`**
- `id`, `name` (unique), `isActive`, `createdAt`, `updatedAt`, `deletedAt`

**`Employee`**
- `id`, `firstName`, `lastName`
- `jobRoleId` → `JobRole`
- `branchId?` → `Branch` (null = central kitchen / unassigned). Used for
  filtering and payslips, not for access control.
- `restDays Int[]` — weekdays off, `0` = Sunday … `6` = Saturday. Default `[0]`.
- `hiredOn @db.Date`, `separatedOn? @db.Date`
- `isActive`
- `userId? @unique` → `User` (the optional login)
- optional contact fields (`phone`, `address`)
- `createdAt`, `updatedAt`, `deletedAt`

**`EmployeeRate`** — rate history, same pattern as `MaterialPriceHistory`
- `id`, `employeeId`, `dailyRate Decimal(12,2)`, `effectiveOn @db.Date`,
  `createdById`, `createdAt`
- Unique on (`employeeId`, `effectiveOn`).
- A raise is a new row, never an edit. A row used by a finalized run cannot be
  changed or removed.

### Inputs to a cutoff

**`RecurringDeduction`**
- `id`, `employeeId`, `name` (SSS / PhilHealth / Pag-IBIG / custom text)
- `employeeShare Decimal(12,2)`, `employerShare Decimal(12,2)` — **monthly**
  amounts
- `isActive`, `createdAt`, `updatedAt`, `deletedAt`

**`Absence`**
- `id`, `employeeId`, `date @db.Date`, `note?`, `createdById`, `createdAt`,
  `deletedAt`
- Unique on (`employeeId`, `date`) among non-deleted rows (partial unique
  index).
- Rejected if `date` is one of the employee's rest days or outside their
  employment window.
- Cannot be created or deleted once the cutoff containing `date` has a
  non-voided run.

**`PayrollAdjustment`** — one-off items
- `id`, `employeeId`, `periodStart @db.Date` (identifies the cutoff)
- `kind` enum `ADDITION | DEDUCTION`
- `category` enum `OVERTIME | BONUS | HOLIDAY | ALLOWANCE | OFFENSE | OTHER`
- `description`, `amount Decimal(12,2)` (always positive; the sign comes from
  `kind`)
- `createdById`, `createdAt`, `deletedAt`
- Locked once the cutoff has a non-voided run.

**`RecurringDeductionSkip`** — the manual skip toggle
- `id`, `employeeId`, `recurringDeductionId`, `periodStart @db.Date`,
  `createdById`, `createdAt`, `deletedAt`
- Unique on (`recurringDeductionId`, `periodStart`) among non-deleted rows.
- Locked once the cutoff has a non-voided run.

### Finalized output

**`PayrollRun`**
- `id`, `periodStart @db.Date`, `periodEnd @db.Date`
- `status` enum `FINALIZED | PAID | VOIDED`
- `finalizedAt`, `finalizedById`, `paidAt?`, `paidById?`, `voidedAt?`,
  `voidedById?`, `voidReason?`
- Snapshot totals: `employeeCount`, `totalNetPay`, `totalEmployerShare`
- Partial unique index: one row per `periodStart` where `status <> 'VOIDED'`.

**`Payslip`** — one per employee per run
- `id`, `runId`, `employeeId`
- Snapshot fields: `employeeName`, `jobRoleName`, `branchName?`,
  `workingDays`, `absenceDays`, `daysWorked`, `basicPay`, `totalAdditions`,
  `totalDeductions`, `netPay`, `totalEmployerShare`
- Unique on (`runId`, `employeeId`).

**`PayslipLine`**
- `id`, `payslipId`, `sortOrder`
- `type` enum `BASIC | ADDITION | DEDUCTION | EMPLOYER_SHARE`
- `label`, `quantity? Decimal(12,2)`, `rate? Decimal(12,2)`,
  `amount Decimal(12,2)`
- `sourceType?` / `sourceId?` — the adjustment, recurring deduction or rate
  that produced the line, for traceability.

The payslip prints from `Payslip` + `PayslipLine` alone, so it stays correct
after the employee's name, role, rate or deductions change.

## 4. Computation

`src/server/payroll/compute-payslip.ts` — a pure function with no database
access.

**Input:** the employee (`hiredOn`, `separatedOn`, `restDays`), their rate
history, the cutoff (`periodStart`, `periodEnd`), their absences in the
cutoff, their adjustments for the cutoff, their recurring deductions and any
skips for the cutoff.

**Output:** payslip lines, totals and a list of warnings.

### Cutoffs

Fixed: the 1st–15th and the 16th–last day of the month, in the Manila
calendar. `periodStart` (the 1st or the 16th) identifies a cutoff. Any
"current cutoff" default is derived with
`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`, never from the
process clock.

### Steps, per employee

1. **Employment window** = the cutoff clipped to `hiredOn … separatedOn`.
2. **Working days** = days in the window whose weekday is not in `restDays`.
3. **Days worked** = working days − absences in the window.
4. **Basic pay** = the sum, over every day worked, of the `EmployeeRate` in
   effect on that day (the latest `effectiveOn` ≤ that day). Consecutive days
   at the same rate collapse into one `BASIC` line (`quantity` days × `rate`),
   so a raise mid-cutoff yields two lines.
5. **Additions** = each `ADDITION` adjustment for the cutoff, one line each.
6. **Deductions** = each `DEDUCTION` adjustment for the cutoff, plus — on the
   **1–15 cutoff only** — the `employeeShare` of every active, non-skipped
   recurring deduction.
7. **Employer share** = on the 1–15 cutoff only, one `EMPLOYER_SHARE` line
   per active, non-skipped recurring deduction. Does not affect net pay.
8. **Net pay** = basic + additions − deductions, computed in centavos.

### Who is included

Every non-deleted employee whose employment window overlaps the cutoff.
Separated and inactive employees are still included for a cutoff they worked
in.

### Warnings

- **Blocking:** a day worked has no rate in effect. Finalize is refused until
  a rate is added.
- **Non-blocking:** net pay below zero. Shown in red; finalize is allowed.
  The admin decides whether to move a deduction to a later cutoff.
- **Non-blocking:** days worked is zero but recurring deductions apply. The
  admin can skip them for that cutoff.

### Holidays

Not modelled. A holiday counts as a normal working day paid at the daily
rate. Holiday premium pay is entered as a `HOLIDAY` addition.

## 5. Lifecycle

**Draft.** A cutoff with no non-voided run is a draft. `GET` computes it live
from current data. Nothing is stored.

**Finalize** — one transaction, under an advisory lock on the cutoff, with an
idempotency key (as adjustments and transfers use):

1. Refuse if a non-voided run already exists for the cutoff.
2. Recompute every payslip server-side. The client's draft is never trusted.
3. Refuse if any blocking warning remains.
4. Write `PayrollRun`, `Payslip` and `PayslipLine` rows.
5. Record an `AuditEvent`.

Once finalized, absences dated in the cutoff, its adjustments and skips are
locked, and rates used by the run cannot be altered.

**Mark paid.** `FINALIZED` → `PAID`, recording who and when.

**Void.** `FINALIZED` or `PAID` → `VOIDED`, with a required reason. The run
and its payslips are kept. Inputs for the cutoff unlock. Finalizing again
creates a new run.

## 6. API and permissions

A new `payroll` permission key in `src/lib/rbac/features`, seeded to the
`ADMIN` role only. **Every** controller in both modules carries, at class
level, `@Roles(UserRole.ADMIN)` and `@RequireFeature('payroll')`. This
deliberately departs from the app's "reads are open to any authenticated
user" default: salaries must never be readable by a non-admin.

All routes are under `/api/v1`.

### Employees module

| Method | Route | Purpose |
|---|---|---|
| GET | `/employees` | List; filter by `branchId`, `jobRoleId`, `active` |
| POST | `/employees` | Create (with starting rate) |
| GET | `/employees/:id` | Detail |
| PATCH | `/employees/:id` | Edit details |
| PATCH | `/employees/:id/status` | Separate / reactivate |
| GET, POST | `/job-roles` | List / create |
| PATCH | `/job-roles/:id` | Rename / deactivate |
| GET, POST | `/employees/:id/rates` | Rate history / new rate |
| GET, POST | `/employees/:id/recurring-deductions` | List / add |
| PATCH | `/employees/:id/recurring-deductions/:dedId` | Edit / deactivate |
| GET | `/absences?from&to&employeeId` | List |
| POST | `/absences` | Record |
| DELETE | `/absences/:id` | Soft delete (refused if finalized) |
| POST | `/employees/:id/account` | Create login `{ email, role, branchId? }` |
| POST | `/employees/:id/account/link` | Link existing login `{ userId }` |
| DELETE | `/employees/:id/account` | Deactivate the login; link is kept |

**Login rules:**
- Account creation reuses `UsersService.createByAdmin` (temporary password,
  `mustChangePassword`).
- `role` must be one of `USER`, `VIEWER`, `INVENTORY`, `MANAGER`. `ADMIN` is
  rejected; granting it stays a deliberate action on the Users screen.
- Linking refuses a user already linked to another employee.

### Payroll module

| Method | Route | Purpose |
|---|---|---|
| GET | `/payroll/cutoffs?year` | Cutoffs with status, employee count, totals |
| GET | `/payroll/cutoffs/:periodStart` | Live draft, or the active run if finalized |
| GET, POST | `/payroll/adjustments` | List (by cutoff) / add |
| DELETE | `/payroll/adjustments/:id` | Soft delete (refused if finalized) |
| POST | `/payroll/cutoffs/:periodStart/skips` | Skip a recurring deduction `{ employeeId, recurringDeductionId }` |
| DELETE | `/payroll/skips/:id` | Undo a skip (refused if finalized) |
| POST | `/payroll/cutoffs/:periodStart/finalize` | Finalize (idempotency key) |
| POST | `/payroll/runs/:id/paid` | Mark paid |
| POST | `/payroll/runs/:id/void` | Void `{ reason }` |
| GET | `/payroll/runs/:id` | Run with payslips |
| GET | `/payroll/payslips/:id` | One payslip with lines |

### Validation and data hygiene

- DTOs reject money with more than 2 decimals, negative amounts, and dates
  not in `YYYY-MM-DD` form.
- `periodStart` must be the 1st or the 16th of a month.
- Payroll data is never included in `User` payloads or the users list.
- Every write records an `AuditEvent`.

## 7. UI

Routes under `src/app/(app)/`, shadcn components, TanStack Query through new
typed wrappers in `src/lib/apiServices.ts`. A new sidebar group **People**,
shown only to holders of the `payroll` permission. `RouteGuard` also blocks
the routes; the server guard is the real boundary.

**`/employees` — employee list.** Name, job role, branch, current daily rate,
rest days, login (none / email + access level), status. Filters for branch,
job role and active vs separated. "Add employee" dialog: name, job role,
branch, hire date, rest days (seven weekday toggles, Sunday on by default),
starting daily rate. Job roles are managed from a small dialog on this page.

**`/employees/[id]` — employee detail**, with tabs:
- **Profile** — edit details, separate or reactivate.
- **Rates** — history table and "New rate" (amount + effective date).
- **Deductions** — recurring deductions (name, employee share, employer
  share, active) with inline add/edit. A note says they are taken monthly on
  the 1–15 cutoff.
- **Absences** — a month calendar. Rest days are greyed out; clicking a
  working day toggles an absence; days in finalized cutoffs are locked.
- **Account** — create login, link existing login, or deactivate login.

**`/payroll` — cutoff list** for a year: period, status badge (open /
finalized / paid / voided), employee count, total net pay, total employer
share.

**`/payroll/[periodStart]` — cutoff screen.**
- One row per employee: working days, absences, days worked, basic pay,
  additions, deductions, net pay. Warnings inline: red for negative net, a
  blocking badge for a missing rate.
- Expanding a row shows its lines and actions: add addition, add deduction
  (category + description + amount), skip a recurring deduction for this
  cutoff, and a link to the employee's absences.
- Footer totals and **Finalize**. The confirm dialog repeats total net pay
  and employee count. Disabled while any blocking warning remains.
- After finalizing the page is read-only, with **Mark as paid**, **Void**
  (reason required) and **Print payslips**.
- On phones, rows collapse into cards.

**Payslips — `/payroll/payslips/[id]` and `/payroll/runs/[id]/print`.** A
print-optimised page (`@media print`, A4, two payslips per page in the batch
view) printed or saved as PDF from the browser. No PDF library. Content:
bakery name, cutoff, employee name, job role and branch, days × rate lines,
each addition and deduction, and net pay in bold. The employer share is not
shown on the employee's payslip.

## 8. Testing

Jest for `src/server`, vitest for the frontend. Implementation is
test-driven.

**`compute-payslip.spec.ts`**
- A standard cutoff: Sunday rest, no absences, rate × working days.
- Absences reduce days worked.
- Several rest days per week; 16th–28/29/30/31 cutoffs, including leap-year
  February.
- Hire and separation mid-cutoff clip the window.
- A rate change mid-cutoff yields two `BASIC` lines with the right split.
- Recurring deductions and employer shares apply on the 1–15 cutoff only;
  employer shares do not change net pay.
- A skip removes exactly one deduction for one cutoff.
- Negative net → non-blocking warning; missing rate on a worked day →
  blocking warning.
- Centavo arithmetic has no float drift (e.g. 13 × ₱537.33 plus summed
  deductions).
- Cutoff resolution uses Manila time: with the clock at 16:30 UTC on the
  15th, the current cutoff is the 16th's.

**Service specs (Prisma mocked)**
- Finalize refuses when a non-voided run exists and when blocking warnings
  remain; writes snapshots equal to the draft; a retried idempotency key
  returns the same run.
- Void keeps the run and unlocks inputs; re-finalizing creates a new run.
- Absence, adjustment and skip writes are refused inside a finalized cutoff.
- Absences on rest days or outside employment are rejected.
- Rates used by a finalized run cannot be altered.
- Account creation rejects `ADMIN`, reuses `createByAdmin`, sets
  `mustChangePassword`; linking refuses an already-linked user.

**Authorization**
- `rbac-matrix.spec.ts`: every `employees`, `job-roles`, `absences` and
  `payroll` route is forbidden to `USER`, `VIEWER`, `INVENTORY` and
  `MANAGER`, and allowed to `ADMIN`.
- One HTTP-level spec in the style of `branch.guard.http.spec.ts`: a
  `VIEWER` token gets 403 on `GET /payroll/cutoffs/:periodStart` through the
  real guard stack.

**Frontend**
- The People sidebar group is hidden without the `payroll` permission.
- Finalize is disabled while blocking warnings exist; warnings render per
  row.
- The absence calendar does not allow clicking rest days or finalized days.

**Manual check**
`npm run build && npm start`; create two employees (one with a mid-cutoff
raise); add absences, an addition and an offense deduction; finalize the 1–15
cutoff; print payslips; void and re-finalize.

## 9. Migration and rollout

- The migration is additive: new tables and enums, and the seeded `payroll`
  feature. `User` is not altered.
- The local `.env` points at the **production** Supabase. Migrations must run
  against a separate development database, or only after explicit
  confirmation, before `npm run prisma:migrate`.
- Run `npm run prisma:generate` after the schema change (stop the dev server
  first on Windows).
- No backfill. Existing logins are linked to employee records by the admin as
  needed.
