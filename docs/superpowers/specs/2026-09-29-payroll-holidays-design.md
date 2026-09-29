# Payroll holidays — design

Date: 2026-09-29
Status: draft, awaiting review
Extends: `2026-09-24-payroll-design.md` (replaces its "Holidays: not modelled")

## 1. Intent

The admin enters the year's regular and special holidays once. Payroll then
pays each employee the right amount for every holiday in a cutoff
automatically, using two multipliers the admin controls in settings. Today
holiday premium is typed in by hand as a `HOLIDAY` adjustment per employee;
that manual step goes away for ordinary holidays.

Success looks like: the admin adds "Dec 25, Christmas Day, regular", and every
payslip in that cutoff shows the correct holiday line without anyone typing it.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Who sets holidays | Admin, per date. Nationwide — no per-branch holidays. |
| Holiday types | `REGULAR` and `SPECIAL`. One holiday per date. |
| Open / closed | Each holiday is **open by default** (the bakery operates on holidays). An admin may mark one **closed**. |
| Who worked | No timekeeping. On a scheduled working day an employee is present unless an `Absence` exists — same as every other day. |
| Worked on a holiday | Daily rate × that type's multiplier. |
| Absent on a holiday (scheduled day) | **No pay at all** for that day — neither basic nor holiday pay. Same for a closed holiday. |
| Holiday on the employee's rest day, not worked | **100% of the daily rate**, both types. |
| Holiday on the employee's rest day, worked | Admin marks it; paid daily rate × that type's multiplier (same multiplier as a scheduled day — no separate rest-day rate). |
| Day-before / day-after rule | Not used. Pay depends only on the holiday itself. |
| Multipliers | Two global settings, regular (default 2.00) and special (default 1.30), edited in Settings → Payroll. Drafts read them live; finalized payslips keep the value they used. |
| Locking | Holidays and rest-day marks in a finalized cutoff cannot change. Multiplier changes are never locked (finalized payslips are frozen anyway). |

### Rules table

| Day for this employee | Regular holiday | Special holiday |
|---|---|---|
| Worked (scheduled day and present, or rest day marked worked) | daily rate × regular multiplier | daily rate × special multiplier |
| Scheduled working day, absent — or the holiday is closed | ₱0 | ₱0 |
| Rest day, not marked worked | daily rate × 1.00 | daily rate × 1.00 |

A rest-day mark on a closed holiday cannot exist (see §3), so a closed holiday
on a rest day always falls in the last row.

### Out of scope

Auto-filling the official DOLE holiday list, copying holidays from last year,
per-branch holidays, two holidays on one date (double-holiday pay), dated
multiplier history, holiday premiums for night shift or overtime.

## 2. Computation

All of it lives in `src/server/payroll/compute-payslip.ts`, which stays pure
and remains the only function that computes pay. The live draft and finalize
both call it.

### New inputs

```ts
export interface HolidayInput {
  id: number;
  date: string;               // YYYY-MM-DD, inside the cutoff
  name: string;
  type: 'REGULAR' | 'SPECIAL';
  isClosed: boolean;
}

// added to PayslipInput
holidays: HolidayInput[];           // live holidays in the cutoff
restDayWorkHolidayIds: number[];    // this employee's live rest-day marks
multipliers: { regular: number; special: number };
```

### Per-date rule

For every date in the employee's employment window:

1. **Not a holiday** → unchanged. A scheduled, non-absent day is a basic-pay
   day.
2. **Holiday on a scheduled working day** (not a rest day):
   - absent, or holiday closed → nothing paid; counts in `absenceDays`;
   - otherwise → worked: one `HOLIDAY` line at the type's multiplier.
3. **Holiday on a rest day:**
   - marked worked → one `HOLIDAY` line at the type's multiplier;
   - not marked → one `HOLIDAY` line at 1.00.

A mark for a holiday that falls on a scheduled working day (the employee's
rest days changed after the mark) is ignored; rule 2 applies, and a
non-blocking `IGNORED_REST_DAY_MARK` warning names the date.

### Payslip lines

Holiday dates are excluded from the `BASIC` line and each gets its own line:

```
Basic pay                               11 × ₱600.00        ₱6,600.00
Regular holiday — Dec 25 (worked)     2.00 × ₱600.00        ₱1,200.00
Special holiday — Dec 8 (rest day)    1.00 × ₱600.00          ₱600.00
```

- `type = 'HOLIDAY'`, `sourceType = 'Holiday'`, `sourceId = holiday.id`.
- `quantity` = the multiplier applied, `rate` = the daily rate on that date
  (`rateOn`, so a mid-cutoff raise is honoured).
- Label suffix: `(worked)` for a worked scheduled day, `(rest day, worked)`
  for a marked rest day, `(rest day)` for an unmarked rest day.
- Amount in centavos: `round(centavos(rate) × multiplier)`; the multiplier has
  two decimals, so the product is exact before rounding to whole centavos.
- Lines are ordered after the `BASIC` lines, by date.

### Totals and counts

- New figure `holidayPay` = sum of `HOLIDAY` lines.
- `netPay = basicPay + holidayPay + totalAdditions − totalDeductions`.
- `workingDays` = scheduled (non-rest) days in the window, holidays included.
- `absenceDays` = scheduled days not worked: absences plus closed holidays.
- `daysWorked` = scheduled days worked (holidays included) plus rest-day
  holidays marked worked.

### Warnings

- `MISSING_RATE` (blocking, existing) also covers holiday dates that would be
  paid but have no rate in effect.
- `IGNORED_REST_DAY_MARK` (non-blocking, new) as above.
- `NO_DAYS_WORKED` keeps its current meaning, using the new `daysWorked`.

The `HOLIDAY` adjustment category stays, for one-off cases the rules do not
cover.

## 3. Data model

Migration `20261003100000_payroll_holidays`. Actor columns are plain ids without a
foreign key, as in the rest of payroll. No RLS, as in the rest of payroll
(Prisma connects as the owner).

```prisma
enum HolidayType {
  REGULAR
  SPECIAL
}

/// A nationwide holiday. Open (the bakery operates) unless isClosed.
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

Changes to existing models:

- `Payslip.holidayPay Decimal @default(0) @db.Decimal(12, 2)`. Existing
  payslips read ₱0, which is what they paid.
- `PayslipLineType` gains `HOLIDAY`.
- `Employee` gains the back-relation `holidayRestDayWork`.

In the migration SQL (Prisma cannot express these):

```sql
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

### Writer rules

Every holiday and mark writer runs in a transaction and first calls
`assertCutoffOpen(tx, periodStart)` for the cutoff containing the holiday's
date (advisory lock namespace 4). A finalized cutoff's holidays and marks
cannot change until its run is voided.

- **Create holiday:** 409 if a live holiday already exists on the date.
- **Edit holiday:** `name`, `type`, `isClosed` only. The date is immutable —
  to move a holiday, delete and recreate it, so one write never touches two
  cutoffs. Setting `isClosed = true` is refused (409) while the holiday has
  live rest-day marks.
- **Delete holiday:** soft delete. Its marks are left as they are and ignored
  (the input loader only reads marks of live holidays).
- **Add mark:** refused (400) if the date is not one of the employee's rest
  days, is outside their employment (`hiredOn` … `separatedOn`), or the
  holiday is closed; 409 on a duplicate live mark.
- **Remove mark:** soft delete.
- **Settings:** each multiplier 1.00–5.00, at most two decimals (400
  otherwise). No cutoff lock.

## 4. API

A new `HolidaysController` (with `HolidaysService` and
`PayrollSettingsService`) in the `payroll` module. Class-level
`@Roles(UserRole.ADMIN)` and `@RequireFeature('payroll')`, reads included.

| Method | Route | Body / query | Notes |
|---|---|---|---|
| GET | `/payroll/settings` | — | `{ regularHolidayMultiplier, specialHolidayMultiplier }` |
| PATCH | `/payroll/settings` | either or both multipliers | |
| GET | `/payroll/holidays` | `?year=2026` | Each row has `locked: boolean` (its cutoff is finalized) |
| POST | `/payroll/holidays` | `{ date, name, type, isClosed? }` | |
| PATCH | `/payroll/holidays/:id` | `{ name?, type?, isClosed? }` | |
| DELETE | `/payroll/holidays/:id` | — | |
| POST | `/payroll/holidays/:id/rest-day-work` | `{ employeeId }` | |
| DELETE | `/payroll/rest-day-work/:id` | — | |

`GET /payroll/cutoffs/:periodStart` additionally returns
`holidays: [{ id, date, name, type, isClosed, restDayEmployees: [{ employeeId,
name, markId | null }] }]` — for each holiday, the employees employed that day
whose rest day it is, with their mark if any. The cutoff page needs no extra
call.

`PayrollInputsService` loads live holidays in the cutoff, live marks of those
holidays, and the settings row, and passes them to `computePayslip`. Finalize
writes `holidayPay` and the `HOLIDAY` lines into the snapshot like any other
line.

## 5. Screens

- **Settings → Payroll** (`/settings/payroll`, new; feature key `payroll`):
  - *Multipliers* card: two inputs shown as percentages ("Regular holiday
    worked — 200%", "Special holiday worked — 130%"), with the note "Applies
    to drafts; finalized payslips keep the rate they used."
  - *Holidays* card: year picker, table (date, name, type badge, open/closed),
    Add / Edit dialog, delete. Rows in a finalized cutoff show a lock and no
    actions.
- **Cutoff page** (`/payroll/[periodStart]`): a *Holidays in this cutoff*
  panel, shown only when the cutoff has any. Each holiday shows its type and
  open/closed state, then the employees on rest day that date with a
  **Worked** toggle. Toggles are disabled when the holiday is closed or the
  cutoff is finalized.
- **Payslip view:** renders `HOLIDAY` lines and a *Holiday pay* subtotal.

## 6. Testing

- **`compute-payslip.spec.ts`:** worked regular (2.00×) and special (1.30×);
  absent on a scheduled holiday → ₱0 and counted in `absenceDays`; closed
  holiday → ₱0; rest day unmarked → 1.00×; rest day marked → multiplier;
  stale mark ignored with `IGNORED_REST_DAY_MARK`; mid-cutoff raise uses the
  rate on the holiday; missing rate on a holiday → `MISSING_RATE`;
  `holidayPay` in net; holiday dates excluded from `BASIC`; centavo rounding.
- **`holidays.service.spec.ts`:** writes in a finalized cutoff → 409;
  duplicate live date → 409; mark refused on a non-rest day, outside
  employment, or on a closed holiday; closing refused while marks exist;
  deleted holiday's marks ignored by the loader.
- **`payroll-settings.service.spec.ts`:** range and precision validation.
- **`payroll-runs.service.spec.ts`:** finalize stores `holidayPay` and
  `HOLIDAY` lines; a later multiplier change leaves the frozen payslip
  unchanged.
- **Authorization:** new routes added to `rbac-matrix.spec.ts` and
  `payroll.authz.http.spec.ts`; MANAGER and VIEWER get 403 on reads and
  writes.
- **Frontend (vitest):** `PayslipView.spec.tsx` renders holiday lines and the
  subtotal; the cutoff panel's Worked toggle is disabled for a closed holiday
  and a finalized cutoff.
