# Branch cash — expenses, vale and the daily cash count — design

Date: 2026-09-24
Status: draft, awaiting review
Depends on: payroll (`docs/superpowers/specs/2026-09-24-payroll-design.md`),
which must ship first.

## 1. Intent

Each branch's paper inventory sheet also lists the day's **expenses** paid from
the drawer (ice, LPG, fare) and **vale** — cash advances handed to staff. The
admin then works out by hand whether sales, expenses, vale and the cash turned
over agree.

This feature moves that bottom section of the sheet into the app, next to the
inventory it already sits beside on paper, and does the arithmetic:

```
Sales (derived from inventory, unchanged)   ₱12,450
− Expenses paid from the drawer                ₱850
− Vale handed to staff                         ₱500
= Expected cash                             ₱11,100
  Actual cash (counted by the manager)      ₱11,050
  Over / short                                −₱50
```

Success looks like: a branch manager records expenses, vale and the counted
cash for the day on the inventory screen, the way they fill in the sheet today.
The admin opens the day or a period, sees expected cash and over/short already
computed, and marks each branch-day verified — no calculator. Every vale
automatically comes off that employee's payslip.

### Sales are not changed

Expenses and vale are **not** sales. Sales stays what the branch earned
(`sold × that day's price`). Total Revenue, the sales page and the dashboard
keep their meaning. Expenses and vale only change how much cash is *expected*
in the drawer, and they are shown as a separate reconciliation.

### Decisions made during brainstorming

| Topic | Decision |
|---|---|
| Relation to sales | Separate entity. Sales is untouched; expected cash = sales − expenses − vale. |
| Actual cash | The manager records the counted cash; the app shows over/short. |
| Vale → payroll | Automatic. Payroll reads vale directly as a deduction; nothing is copied. |
| Expense description | A category from an admin-managed list, an amount and an optional note (required for "Other"). |
| Review | The admin verifies a branch-day, which locks its expenses, vale and cash. The admin can reopen. |
| Inventory | Never locked by this feature. Sales drift after verification is flagged, not blocked. |
| Build order | Payroll ships first; this feature follows. |

### Out of scope

Expense receipts or photos, expense approval before spending, linking expenses
to suppliers or materials, petty-cash float tracking, bank deposit records,
vale repayment in cash (vale is only settled through payroll), dashboard cards
for expenses, cash entry in the mobile quick-entry flow, notifications on
over/short.

## 2. Architecture

One new NestJS module, **`src/server/branch-cash/`**, in the standard
module/controller/service/`dto` layout. It depends on `SalesService` (for the
sales figure) and on payroll's `Employee` table and cutoff lock
(`src/server/payroll/payroll-lock.util.ts`).

One pure function, `computeCashDay`, turns a branch-day's sales, expense lines,
vale lines, actual cash and verify snapshot into totals, over/short and drift.
The day endpoint and the summary endpoint both call it.

Payroll gains one input: the employee's vale in the cutoff. It reads
`BranchVale` rows directly, so a vale and the payslip that deducts it cannot
disagree.

## 3. Data model

Conventions follow payroll: money is `Decimal(12,2)`, read through `num()` and
summed in centavos (`common/utils/decimal.util.ts`); calendar dates are Manila
days stored as `@db.Date`. Nothing is hard-deleted. Every write records an
`AuditEvent`.

**`ExpenseCategory`**
- `id`, `name` (unique), `sortOrder Int`, `isActive Boolean`, `requiresNote
  Boolean`, `createdAt`, `updatedAt`, `deletedAt`
- Seeded by migration: Utilities, Transport, Supplies, Repairs, Other
  (`requiresNote = true` for Other).

**`BranchExpense`**
- `id`, `branchId` → `Branch`, `date @db.Date`, `categoryId` →
  `ExpenseCategory`, `amount Decimal(12,2)`, `note String?`
- `createdById`, `updatedById?`, `deletedById?` — plain ids without a foreign
  key, as in payroll, so `User` does not grow a back-relation each
- `createdAt`, `updatedAt`, `deletedAt`
- Index (`branchId`, `date`)

**`BranchVale`**
- `id`, `branchId` → `Branch`, `date @db.Date`, `employeeId` → `Employee`,
  `amount Decimal(12,2)`, `note String?`
- Audit columns as on `BranchExpense`
- Indexes (`branchId`, `date`) and (`employeeId`, `date`)

**`BranchCashDay`** — at most one per branch-day, created on first write of
actual cash or on verify.
- `id`, `branchId`, `date @db.Date`, unique (`branchId`, `date`)
- `actualCash Decimal(12,2)?`, `note String?`
- `status` enum `BranchCashDayStatus { OPEN, VERIFIED }`, default `OPEN`
- `verifiedById?` (plain id), `verifiedAt?`
- Snapshot written at verify, cleared at reopen: `salesAtVerify`,
  `expensesAtVerify`, `valeAtVerify` (all `Decimal(12,2)?`)
- `createdAt`, `updatedAt`

A branch-day with no `BranchCashDay` row is `OPEN` with no actual cash.

`AuditEntity` gains `'ExpenseCategory' | 'BranchExpense' | 'BranchVale' |
'BranchCashDay'`.

## 4. Computation

`src/server/branch-cash/compute-cash-day.ts`, pure, all arithmetic in centavos:

- `expenses` = Σ non-deleted expense amounts
- `vale` = Σ non-deleted vale amounts
- `expected` = `sales − expenses − vale` (may be negative; shown as is)
- `overShort` = `actualCash − expected`, or `null` when actual cash is unset
- `state`: `NOT_COUNTED` (no actual cash), `BALANCED` (overShort = 0),
  `OVER` (> 0), `SHORT` (< 0)
- `drift` (verified days only): for each of sales, expenses, vale whose live
  value differs from its snapshot, `{ field, atVerify, now }`. Expenses and
  vale cannot change while verified, so in practice only sales drifts.

`sales` is `totals.totalSales` from `SalesService.getByBranchAndDate` for one
day, and from `SalesService.getDailySummary` for a range (once per branch when the summary
spans all branches; there are only a handful), so the figure always matches
the sales page. `SalesService` is exported from `SalesModule` for this.

## 5. Access and API

### Permission keys

A new feature in `src/lib/rbac/features.ts`, key **`branch-cash`**, label
"Cash reports", nav group Operations, route `/branch-cash`, with actions:

| Key | Grants | Default roles |
|---|---|---|
| `branch-cash` | Read days and summaries, the category list and the employee picker | MANAGER, ADMIN |
| `branch-cash:create` | Add expenses and vale; set actual cash | MANAGER, ADMIN |
| `branch-cash:edit` | Edit expenses and vale | MANAGER, ADMIN |
| `branch-cash:delete` | Void expenses and vale | MANAGER, ADMIN |
| `branch-cash:verify` | Verify and reopen a branch-day | ADMIN |
| `branch-cash:categories` | Add, rename, reorder and deactivate categories | ADMIN |

Branch scope comes from `all-branches` through `BranchGuard`, like every other
branch-scoped endpoint: a MANAGER sees and writes only their own branch.
`VIEWER` and `INVENTORY` get nothing by default, because cash figures are more
sensitive than the catalog. An admin can grant them the read key. Writes also
carry a role floor, as every write in the app does: `@Roles(MANAGER)` on
create/edit/delete and `@Roles(ADMIN)` on verify and categories. Each action's
`minRole` in the manifest mirrors that floor (`rbac-matrix.spec` checks it).

A migration registers the keys in `Feature`, the same way payroll's Task 2
does; role defaults live in `ROLE_DEFAULTS` in code.

### Endpoints (`/api/v1/branch-cash`)

| Method | Path | Key | Purpose |
|---|---|---|---|
| GET | `/day?branchId&date` | branch-cash | The branch-day: sales, expense lines, vale lines, actual cash, status, computed totals, drift |
| GET | `/summary?from&to&branchId?` | branch-cash | One row per branch-day with sales or any cash entry, plus period totals. Range capped by `MAX_REPORT_RANGE_DAYS`. `?unverified=true` filters. |
| POST | `/expenses` | :create | Add an expense |
| PATCH | `/expenses/:id` | :edit | Edit category, amount or note |
| DELETE | `/expenses/:id` | :delete | Void (sets `deletedAt`, `deletedById`) |
| POST | `/vale` | :create | Add a vale |
| PATCH | `/vale/:id` | :edit | Edit employee, amount or note |
| DELETE | `/vale/:id` | :delete | Void |
| PUT | `/day/actual-cash` | :create | Body `{ branchId, date, actualCash: number \| null, note? }` |
| POST | `/day/verify` | :verify | Body `{ branchId, date }`. Writes the snapshot, locks the day |
| POST | `/day/reopen` | :verify | Body `{ branchId, date }`. Clears the snapshot, unlocks |
| GET | `/employees?branchId&date` | branch-cash | Employees employed on `date` as `{ id, name, branchId }`, the requested branch's first |
| GET | `/categories` | branch-cash | Active categories in `sortOrder` |
| POST, PATCH | `/categories[/:id]` | :categories | Create, rename, reorder, activate or deactivate |

The date and branch of an existing expense or vale are fixed. Moving one is a
void plus a new entry, so each branch-day's lock covers exactly its own rows.

### Rules, enforced inside one transaction per write

1. **Date.** Not later than today in Manila
   (`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`). Past days
   are allowed; managers often catch up the next morning.
2. **Day lock.** The branch-day must not be `VERIFIED` → 409 "This day is
   verified. Ask an admin to reopen it." Applies to expenses, vale and actual
   cash. Every write and verify/reopen first takes a transaction-scoped
   advisory lock on the branch-day (namespace 5; stock chains use 1–3,
   payroll 4), so verify and a write cannot interleave even before a
   `BranchCashDay` row exists.
3. **Payroll lock (vale only).** `assertCutoffOpen(tx, cutoffOf(date).periodStart)`
   → 409 "Payroll for this period is already finalized." Applies to create,
   edit and void.
4. **Employee (vale only).** Not deleted, and `hiredOn ≤ date` and
   (`separatedOn` is null or `date ≤ separatedOn`) → 400 otherwise. This
   guarantees payroll includes the employee in that cutoff.
5. **Amount.** `> 0`, `≤ MAX_MONEY`, at most 2 decimals (DTO validation).
6. **Category.** Active; a note is required when `requiresNote`.
7. **Row scope.** `PATCH` / `DELETE` by `:id` carry no branch in the body, so
   the service compares the row's `branchId` with the `branchId` that
   `BranchGuard` pinned into `req.query` for scoped users → 404 on mismatch,
   never 403, so a scoped user cannot probe other branches' ids.
8. **Verify** requires actual cash to be set → 400 "Enter the counted cash
   before verifying." Reopen requires `VERIFIED`.

Verify and reopen are audited with the snapshot values in `changes`.

## 6. Payroll integration

Changes to the payroll design and plan, made when this feature is built:

- `compute-payslip.ts`: `PayslipInput` gains `vale: ValeInput[]`, where
  `ValeInput = { id: number; date: string; branchName: string; amount: number }`.
  Each vale becomes one `DEDUCTION` line labelled `Vale — <branch>, <Mon D>`,
  with `sourceType: 'BranchVale'` and `sourceId`. `LineSource` gains
  `'BranchVale'`.
- `PayrollDraftService.build` loads non-deleted `BranchVale` rows with `date`
  in the cutoff for the employees in the draft.
- Finalize snapshots the vale lines into `PayslipLine` like any other line.
- `NEGATIVE_NET` already warns when vale exceeds pay; no new warning is needed.
- Voiding a run unlocks that cutoff's vale again, through the same
  `assertCutoffOpen` check.

## 7. User interface

### Inventory details — the "Cash" section

`src/app/(app)/inventory/components/BranchCashPanel.tsx`, placed **below the
per-type grids** on `/inventory/details`, where it sits at the foot of the
paper sheet. Shown to holders of `branch-cash`.

- **Single branch + single date:** the editable panel.
  - **Expenses** — a compact list (category, note, amount, void button) with
    an inline add row: category select, amount, note. Enter saves.
  - **Vale** — the same shape: employee combobox (from `/branch-cash/employees`),
    amount, note.
  - **Cash** — the reconciliation strip: Sales − Expenses − Vale = Expected,
    an Actual cash input (saves on blur or Enter), and an over/short badge
    (green balanced, amber over, red short, grey not counted).
  - **Status** — Open or Verified (by whom, when). Holders of
    `branch-cash:verify` see Verify / Reopen. A verified day shows its inputs
    read-only, and a drift notice when sales moved since verification.
  - Each list saves its own line immediately, independent of the inventory
    sheet's pending-save bar, so the two never mix.
- **Range, or all branches:** a one-line note, "Select one branch and one day
  to record expenses, vale and cash," with a link to Cash reports.

The existing `InventorySummaryPanel` is not changed: revenue stays revenue.

### Cash reports page — `/branch-cash`

`src/app/(app)/branch-cash/page.tsx`, in the sidebar under Operations.

- Filters: date range (defaults to the current Manila week), branch (hidden
  for scoped users), "Unverified only".
- Table: date, branch, sales, expenses, vale, expected, actual, over/short,
  status. Period totals in the footer. On phones, rows collapse into cards,
  following the mobile-responsive conventions.
- Clicking a row opens a side `Sheet` containing the same `BranchCashPanel`
  for that branch-day, so admins verify without leaving the list.
- Holders of `branch-cash:categories` get a "Categories" button opening a
  dialog to add, rename, reorder and deactivate categories.

Frontend data goes through new `branchCashApi` wrappers in
`src/lib/apiServices.ts` and TanStack Query. Writes invalidate
`['branch-cash', 'day', branchId, date]` and `['branch-cash', 'summary']`.
Inventory writes on the details page also invalidate the day query, so the
sales figure stays live.

## 8. Error handling

- 409s (verified day, finalized payroll) show as toasts with the server's
  message, and the panel refetches so it shows the lock.
- 400s from DTO validation show inline on the add row.
- A 403 hides nothing already rendered; the panel is gated on `useCan`, so a
  403 means permissions changed mid-session and the page shows the standard
  error.
- The summary endpoint rejects ranges over `MAX_REPORT_RANGE_DAYS` with 400,
  the same way sales does.

## 9. Testing

Server (jest):
- `compute-cash-day.spec.ts` — expected, over/short, each state, negative
  expected, drift detection, centavo exactness (e.g. 0.1 + 0.2).
- `branch-cash.service.spec.ts` — every rule in §5: future date, verified-day
  lock on each write, payroll lock on vale create/edit/void, employee window,
  "Other" needs a note, verify requires actual cash, verify writes the
  snapshot, reopen clears it, void never hard-deletes, audit rows written.
- Sales parity — the day endpoint's sales equals
  `SalesService.getByBranchAndDate(...).totals.totalSales`.
- Authorization — extend `rbac-matrix.spec.ts`: MANAGER reaches only their own
  branch; VIEWER and INVENTORY get 403 by default; only ADMIN can verify and
  manage categories. An HTTP-level test in the style of
  `branch.guard.http.spec.ts` covers branch scoping on `/summary`.
- Payroll — `compute-payslip.spec.ts` gains vale lines; the draft service test
  shows a vale in the cutoff deducted and a voided vale ignored; a vale write
  in a finalized cutoff returns 409.

Frontend (vitest):
- `BranchCashPanel` — renders totals and badge states, read-only when
  verified, verify controls only with the key, drift notice.
- Sidebar — "Cash reports" appears only with `branch-cash`.
