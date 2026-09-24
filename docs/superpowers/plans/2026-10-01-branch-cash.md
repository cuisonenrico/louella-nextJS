# Branch Cash (Expenses, Vale, Cash Count) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branch managers record each day's drawer expenses, vale (cash advances to staff) and counted cash next to the inventory sheet; the app computes expected cash and over/short, admins verify each branch-day, and every vale is deducted on the employee's payslip automatically.

**Architecture:** One new NestJS module, `src/server/branch-cash/`, with three services (categories, entries, days) and one pure function, `computeCashDay`, used by both the day view and the period summary. Sales is read from the existing `SalesService`, never recomputed. Payroll's `computePayslip` gains a `vale` input read straight from `BranchVale` rows, so a vale and the payslip that deducts it cannot disagree. The UI is a panel at the foot of `/inventory/details` plus a `/branch-cash` "Cash Reports" page that reuses the panel in a side sheet.

**Tech Stack:** Next.js 16 (App Router, client pages), NestJS 11, Prisma 6 on PostgreSQL (Supabase), class-validator, TanStack Query, shadcn/ui, Tailwind v4, Jest (server), Vitest + Testing Library (frontend).

**Spec:** `docs/superpowers/specs/2026-09-24-branch-cash-design.md`

**Prerequisite:** the payroll plan (`docs/superpowers/plans/2026-09-24-payroll.md`) is fully implemented and merged. This plan uses its `Employee` model, `src/server/payroll/payroll-lock.util.ts` (`assertCutoffOpen`, `day`), `src/lib/payroll/cutoff.ts` (`cutoffOf`), `src/lib/payroll/format.ts` (`peso`), `src/server/common/validators/payroll.validators.ts` (`IsCalendarDate`, `MAX_MONEY`) and `compute-payslip.ts`. **Before Task 1, confirm those files exist**; if any is missing, stop and report — do not recreate them here.

## Global Constraints

- Money columns are `Decimal(12,2)`; read with `num()`, add in centavos (`centavos()` / `pesos()` from `src/server/common/utils/decimal.util.ts`).
- Calendar dates are Manila days stored as `@db.Date`, written with `toUtcDay('YYYY-MM-DD')`, read back with `day(date)`. "Today" is `manilaToday()` from `src/lib/manilaDate.ts` — never the process clock.
- Sales is `SalesService` output (`getByBranchAndDate(...).totals.totalSales`, `getDailySummary(...).dailySummary[].totalSales`). Never recompute sales in this module.
- Expected cash = sales − expenses − vale. It is computed, never stored, except the verify snapshot.
- Nothing is hard-deleted. Expenses and vale are voided with `deletedAt` + `deletedById`; categories are deactivated with `isActive`.
- Every write takes the branch-day advisory lock (namespace **5**; stock chains use 1–3, payroll 4) before checking `VERIFIED`. Vale writes additionally call payroll's `assertCutoffOpen`.
- An expense's or vale's `branchId` and `date` never change after creation.
- Branch scope: controller-level `@UseGuards(BranchGuard)`. For `:id` routes the scoped branch is read from `@Query('branchId')` (pinned by the guard) and a mismatch is **404**, never 403.
- Writes carry a role floor: `@Roles(UserRole.MANAGER)` on create/edit/delete/actual-cash, `@Roles(UserRole.ADMIN)` on verify, reopen and category writes. Reads carry only the `branch-cash` feature key.
- **Do not run `npm run prisma:migrate` or `prisma migrate deploy`.** The local `.env` points at the production Supabase. Migrations are generated offline (Task 1) and applied only after the user explicitly confirms (Task 12).
- On Windows, stop the dev server before `npm run prisma:generate` (EPERM on the engine DLL).
- Run a single server test: `npx jest <path>`. Run a single frontend test: `npx vitest run <path>`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01RHYLoPv73uj2wToAeBWUBE
  ```
  (The commit commands below abbreviate this as `<trailer>`; always include both lines.)

## Deviations from the spec (decided while planning — flag in review)

1. **Update DTOs accept an optional, ignored `branchId`.** `BranchGuard` stamps `branchId` into every body that lacks one for scoped users, and the global `ValidationPipe` uses `forbidNonWhitelisted`, so without the field a manager's PATCH would 400. Pinned by the HTTP test in Task 8.
2. **The verifier is shown by email.** `User` has no name column.
3. **Cash Reports defaults to the last 7 days ending today (Manila)**, not "the current week" — simpler and never empty on a Monday.
4. **Editing a line keeps its category even if that category was deactivated since.** The active check applies only when the category is being changed.
5. **Payroll's employee edits refuse to strand a vale.** Moving `hiredOn` later or `separatedOn` earlier than an existing vale's date returns 409 (Task 9); otherwise that vale would never reach a payslip.

## Review Focus

1. **Double-tapping "Add" on a slow phone connection** → one expense or vale, not two. Pinned in Task 8 (`@Idempotent()` metadata test) and Task 10 (`CashLineForm` sends one idempotency key per intent and disables the button while pending).
2. **A manager catching up just after midnight Manila (16:00–23:59 UTC)** entering today's figures → accepted, not rejected as "future". Pinned in Task 5 (`assertNotFuture` with a UTC instant on the previous calendar day).
3. **An employee separated (or re-dated) after taking a vale** → the change is refused, so the vale cannot silently miss payroll. Pinned in Task 9.
4. **A manager editing or voiding another branch's expense by id** → 404 and nothing written. Pinned in Task 6 (service) and Task 8 (HTTP).
5. **Amounts typed with thousands separators ("1,250.50")** → saved as 1250.5, not rejected or saved as 1. Pinned in Task 10 (`parseAmount`).

---

## File Structure

**Database**
- Modify `prisma/schema.prisma` — 1 enum, 4 models, back-relations on `Branch` and `Employee`.
- Create `prisma/migrations/20261001100000_branch_cash_tables/migration.sql` — generated tables, amount checks, seeded categories.
- Create `prisma/migrations/20261001110000_branch_cash_feature_keys/migration.sql` — the six permission keys.
- Modify `prisma/seed-features.sql` — the same six keys.

**Server — `src/server/branch-cash/`**
- `compute-cash-day.ts` (+ spec) — the pure reconciliation
- `branch-cash-lock.util.ts` (+ spec) — day advisory lock, `assertDayOpen`, `assertNotFuture`
- `expense-categories.service.ts` (+ spec)
- `branch-cash-entries.service.ts` (+ spec) — expenses, vale, actual cash
- `branch-cash-days.service.ts` (+ spec) — day view, summary, verify, reopen, employee picker
- `branch-cash.controller.ts`, `branch-cash.module.ts`
- `dto/branch-cash.dto.ts` (+ `dto/dto-validation.spec.ts`)
- `branch-cash.http.spec.ts`

**Server — changes elsewhere**
- Modify `src/server/common/utils/audit.util.ts` — four audit entities.
- Modify `src/server/sales/sales.module.ts` — export `SalesService`.
- Modify `src/server/app.module.ts` — import `BranchCashModule`.
- Modify `src/server/common/guards/rbac-matrix.spec.ts` — rows.
- Modify `src/server/payroll/compute-payslip.ts` (+ spec), `payroll-draft.service.ts` (+ spec) — vale lines.
- Create `src/server/employees/vale-window.util.ts` (+ spec); modify `employees.service.ts` — refuse stranding a vale.

**Frontend**
- Modify `src/lib/rbac/features.ts`, `src/components/layout/navIcons.ts`, `src/components/layout/Sidebar.spec.tsx`, `src/lib/rbac/features.spec.ts`.
- Modify `src/types/index.ts`, `src/lib/apiServices.ts`.
- Create `src/components/branch-cash/{BranchCashPanel,CashLineForm,CashReconciliation}.tsx`, `src/components/branch-cash/parseAmount.ts`, specs `BranchCashPanel.spec.tsx`, `CashLineForm.spec.tsx`.
- Modify `src/app/(app)/inventory/details/page.tsx` — mount the panel.
- Create `src/app/(app)/branch-cash/page.tsx`, `src/app/(app)/branch-cash/_components/CategoriesDialog.tsx`, `src/app/(app)/branch-cash/page.spec.tsx`.

The panel lives in `src/components/branch-cash/` rather than under `inventory/components/` because two routes mount it.

**Docs**
- Modify `AGENTS.md`.

---

### Task 1: Database schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261001100000_branch_cash_tables/migration.sql`

**Interfaces:**
- Produces: enum `BranchCashDayStatus { OPEN, VERIFIED }`; models `ExpenseCategory`, `BranchExpense`, `BranchVale`, `BranchCashDay`; client accessors `prisma.expenseCategory`, `prisma.branchExpense`, `prisma.branchVale`, `prisma.branchCashDay`; compound unique input `branchId_date` on `BranchCashDay`; relation `Employee.vale`.

- [ ] **Step 1: Snapshot the current schema for the offline diff**

```bash
git show HEAD:prisma/schema.prisma > "$TEMP/schema.before.prisma"
```

- [ ] **Step 2: Add the enum and models**

Append at the end of `prisma/schema.prisma`:

```prisma
// ─── Branch cash ─────────────────────────────────────────────────────────────
// Drawer expenses, vale (cash advances to staff) and the counted cash, per
// branch per Manila day. See docs/superpowers/specs/2026-09-24-branch-cash-design.md.
// Sales is never stored here: it is derived from inventory by SalesService.
// Actor columns are plain ids without a foreign key, as in payroll.

enum BranchCashDayStatus {
  OPEN
  VERIFIED
}

model ExpenseCategory {
  id           Int       @id @default(autoincrement())
  name         String    @unique
  sortOrder    Int       @default(0)
  isActive     Boolean   @default(true)
  requiresNote Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  expenses BranchExpense[]
}

model BranchExpense {
  id          Int       @id @default(autoincrement())
  branchId    Int
  date        DateTime  @db.Date
  categoryId  Int
  amount      Decimal   @db.Decimal(12, 2)
  note        String?
  createdById Int
  updatedById Int?
  deletedById Int?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  branch   Branch          @relation(fields: [branchId], references: [id])
  category ExpenseCategory @relation(fields: [categoryId], references: [id])

  @@index([branchId, date])
  @@index([categoryId])
}

model BranchVale {
  id          Int       @id @default(autoincrement())
  branchId    Int
  date        DateTime  @db.Date
  employeeId  Int
  amount      Decimal   @db.Decimal(12, 2)
  note        String?
  createdById Int
  updatedById Int?
  deletedById Int?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  branch   Branch   @relation(fields: [branchId], references: [id])
  employee Employee @relation(fields: [employeeId], references: [id])

  @@index([branchId, date])
  @@index([employeeId, date])
}

model BranchCashDay {
  id               Int                 @id @default(autoincrement())
  branchId         Int
  date             DateTime            @db.Date
  actualCash       Decimal?            @db.Decimal(12, 2)
  note             String?
  status           BranchCashDayStatus @default(OPEN)
  verifiedById     Int?
  verifiedAt       DateTime?
  // Written at verify, cleared at reopen. Lets a verified day show that sales
  // moved afterwards (a late inventory correction) instead of silently changing.
  salesAtVerify    Decimal?            @db.Decimal(12, 2)
  expensesAtVerify Decimal?            @db.Decimal(12, 2)
  valeAtVerify     Decimal?            @db.Decimal(12, 2)
  createdAt        DateTime            @default(now())
  updatedAt        DateTime            @updatedAt

  branch Branch @relation(fields: [branchId], references: [id])

  @@unique([branchId, date])
}
```

In `model Branch`, add below the last relation line (after `employees` from payroll):

```prisma
  branchExpenses   BranchExpense[]
  branchVale       BranchVale[]
  branchCashDays   BranchCashDay[]
```

In `model Employee`, add below `payslips`:

```prisma
  vale                BranchVale[]
```

- [ ] **Step 3: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Generate the migration SQL offline (no database contact)**

```bash
mkdir -p prisma/migrations/20261001100000_branch_cash_tables
npx prisma migrate diff \
  --from-schema-datamodel "$TEMP/schema.before.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20261001100000_branch_cash_tables/migration.sql
```

Check: `grep -c 'CREATE TABLE' prisma/migrations/20261001100000_branch_cash_tables/migration.sql` prints `4`, and `grep -n 'DROP' …` prints nothing.

- [ ] **Step 5: Append the checks and seed rows Prisma cannot express**

Append to `prisma/migrations/20261001100000_branch_cash_tables/migration.sql`:

```sql

-- Amounts are positive. The DTOs enforce this too; the database is the backstop.
ALTER TABLE "BranchExpense"
  ADD CONSTRAINT "BranchExpense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "BranchVale"
  ADD CONSTRAINT "BranchVale_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "BranchCashDay"
  ADD CONSTRAINT "BranchCashDay_actualCash_nonnegative" CHECK ("actualCash" IS NULL OR "actualCash" >= 0);

-- The starting category list. Admins manage it from Cash Reports.
INSERT INTO "ExpenseCategory" ("name", "sortOrder", "requiresNote", "updatedAt") VALUES
  ('Utilities', 10, false, NOW()),
  ('Transport', 20, false, NOW()),
  ('Supplies',  30, false, NOW()),
  ('Repairs',   40, false, NOW()),
  ('Other',     90, true,  NOW())
ON CONFLICT ("name") DO NOTHING;
```

- [ ] **Step 6: Regenerate the client and type-check**

Stop any running dev server first (Windows EPERM).

Run: `npm run prisma:generate && npx tsc --noEmit -p tsconfig.server.json`
Expected: generate succeeds; tsc prints no errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261001100000_branch_cash_tables
git commit -m "feat(db): branch cash tables — expenses, vale, daily cash count" -m "<trailer>"
```

---

### Task 2: Permission keys and the Cash Reports nav entry

**Files:**
- Modify: `src/lib/rbac/features.ts`
- Modify: `src/lib/rbac/features.spec.ts`
- Modify: `src/components/layout/navIcons.ts`
- Modify: `src/components/layout/Sidebar.spec.tsx`
- Modify: `prisma/seed-features.sql`
- Create: `prisma/migrations/20261001110000_branch_cash_feature_keys/migration.sql`

**Interfaces:**
- Produces: `PermissionKey` values `'branch-cash'`, `'branch-cash:create'`, `'branch-cash:edit'`, `'branch-cash:delete'`, `'branch-cash:verify'`, `'branch-cash:categories'`; route `/branch-cash` governed by `branch-cash`.

- [ ] **Step 1: Write the failing sidebar tests**

Add inside `describe('Sidebar', …)` in `src/components/layout/Sidebar.spec.tsx`:

```tsx
  it('shows Cash Reports only to holders of branch-cash', () => {
    renderWith(['dashboard']);
    expect(screen.queryByText('Cash Reports')).toBeNull();

    renderWith(['branch-cash']);
    expect(visibleItems()).toContain('Cash Reports');
  });

  it('lets managers record cash but only admins verify it', () => {
    expect(ROLE_DEFAULTS.MANAGER).toEqual(
      expect.arrayContaining(['branch-cash', 'branch-cash:create', 'branch-cash:edit', 'branch-cash:delete']),
    );
    expect(ROLE_DEFAULTS.MANAGER).not.toContain('branch-cash:verify');
    expect(ROLE_DEFAULTS.MANAGER).not.toContain('branch-cash:categories');
    for (const role of ['USER', 'VIEWER', 'INVENTORY'] as const) {
      expect(ROLE_DEFAULTS[role]).not.toContain('branch-cash');
    }
    expect(ROLE_DEFAULTS.ADMIN).toEqual(
      expect.arrayContaining(['branch-cash:verify', 'branch-cash:categories']),
    );
  });
```

(`ROLE_DEFAULTS` is already imported there if payroll's Task 2 added its test; otherwise add it to the import from `@/lib/rbac/features`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/components/layout/Sidebar.spec.tsx`
Expected: FAIL — `Cash Reports` not found; `ROLE_DEFAULTS.MANAGER` lacks `branch-cash`.

- [ ] **Step 3: Add the feature**

In `src/lib/rbac/features.ts`, insert into `FEATURES` immediately after the feature whose nav entry is `{ group: 'Operations', href: '/inventory-import/history', …, order: 27 }`:

```ts
  {
    // Drawer expenses, vale and the counted cash beside the inventory sheet.
    // Reads are the feature key alone so an admin can grant a head-office role
    // read access; writes also carry a @Roles floor (see minRole).
    key: 'branch-cash',
    label: 'Cash Reports',
    description: 'Branch expenses, vale and the daily cash count',
    routes: ['/branch-cash'],
    nav: { group: 'Operations', href: '/branch-cash', label: 'Cash Reports', order: 28 },
    platform: 'web',
    actions: [
      {
        id: 'create',
        label: 'Record entries',
        description: 'Add expenses and vale, and enter the counted cash',
        minRole: 'MANAGER',
      },
      {
        id: 'edit',
        label: 'Edit entries',
        description: 'Amend an expense or vale on an unverified day',
        minRole: 'MANAGER',
      },
      {
        id: 'delete',
        label: 'Void entries',
        description: 'Void an expense or vale on an unverified day',
        minRole: 'MANAGER',
      },
      {
        id: 'verify',
        label: 'Verify days',
        description: 'Verify or reopen a branch-day',
        minRole: 'ADMIN',
      },
      {
        id: 'categories',
        label: 'Manage categories',
        description: 'Add, rename, reorder and deactivate expense categories',
        minRole: 'ADMIN',
      },
    ],
  },
```

In `ROLE_DEFAULTS.MANAGER`, add after `'inventory-adjustments:transfer',`:

```ts
    // Their own branch's drawer: they fill in this part of the sheet today.
    'branch-cash',
    'branch-cash:create',
    'branch-cash:edit',
    'branch-cash:delete',
```

(`ADMIN` takes every key already.)

- [ ] **Step 4: Add the icon**

In `src/components/layout/navIcons.ts`, add `Banknote` to the `lucide-react` import (alphabetical order) and to `NAV_ICONS`:

```ts
  'branch-cash': Banknote,
```

- [ ] **Step 5: Register the keys in a migration and the seed script**

Create `prisma/migrations/20261001110000_branch_cash_feature_keys/migration.sql`:

```sql
-- Register the Cash Reports screen and its actions from src/lib/rbac/features.ts.
--
-- RoleFeaturePermission / UserFeaturePermission reference Feature.key, so the
-- keys must exist before the permissions matrix can store an override.
-- Grants nothing: role defaults live in ROLE_DEFAULTS in code.
INSERT INTO "Feature" (key, label, description, "createdAt") VALUES
  ('branch-cash', 'Cash Reports', 'Branch expenses, vale and the daily cash count', NOW()),
  ('branch-cash:create', 'Record entries', 'Add expenses and vale, and enter the counted cash', NOW()),
  ('branch-cash:edit', 'Edit entries', 'Amend an expense or vale on an unverified day', NOW()),
  ('branch-cash:delete', 'Void entries', 'Void an expense or vale on an unverified day', NOW()),
  ('branch-cash:verify', 'Verify days', 'Verify or reopen a branch-day', NOW()),
  ('branch-cash:categories', 'Manage categories', 'Add, rename, reorder and deactivate expense categories', NOW())
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description;
```

In `prisma/seed-features.sql`, add these six rows among the value rows (keep every row except the last one before `ON CONFLICT` ending in a comma):

```sql
  ('branch-cash',                     'Cash Reports',               'Branch expenses, vale and the daily cash count', NOW()),
  ('branch-cash:create',              'Record entries',             'Add expenses and vale, and enter the counted cash', NOW()),
  ('branch-cash:edit',                'Edit entries',               'Amend an expense or vale on an unverified day', NOW()),
  ('branch-cash:delete',              'Void entries',               'Void an expense or vale on an unverified day', NOW()),
  ('branch-cash:verify',              'Verify days',                'Verify or reopen a branch-day', NOW()),
  ('branch-cash:categories',          'Manage categories',          'Add, rename, reorder and deactivate expense categories', NOW()),
```

In `src/lib/rbac/features.spec.ts`, inside `describe('database registration', …)`, add `'20261001110000_branch_cash_feature_keys'` to the array of migration directory names that is read into `migration` (keep whatever entries the array already has, including payroll's).

- [ ] **Step 6: Run the RBAC and sidebar suites**

Run: `npx vitest run src/components/layout src/lib/rbac "src/app/(app)/settings/permissions"`
Expected: PASS, including `registers branch-cash:verify in a migration` and `agrees with the standalone seed script`. If a test pins the exact MANAGER default list, add the four keys there — that is the intended change.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rbac/features.ts src/lib/rbac/features.spec.ts src/components/layout/navIcons.ts src/components/layout/Sidebar.spec.tsx prisma/seed-features.sql prisma/migrations/20261001110000_branch_cash_feature_keys
git commit -m "feat(rbac): branch-cash feature — managers record, admins verify" -m "<trailer>"
```

---

### Task 3: The cash-day computation

**Files:**
- Create: `src/server/branch-cash/compute-cash-day.ts`
- Test: `src/server/branch-cash/compute-cash-day.spec.ts`

**Interfaces:**
- Consumes: `centavos`, `pesos` from `../common/utils/decimal.util`.
- Produces:

```ts
export type CashDayState = 'NOT_COUNTED' | 'BALANCED' | 'OVER' | 'SHORT';
export type DriftField = 'sales' | 'expenses' | 'vale';
export interface CashSnapshot { sales: number; expenses: number; vale: number }
export interface CashDayInput { sales: number; expenseAmounts: number[]; valeAmounts: number[]; actualCash: number | null; snapshot: CashSnapshot | null }
export interface CashDayTotals { sales: number; expenses: number; vale: number; expected: number; actualCash: number | null; overShort: number | null; state: CashDayState; drift: { field: DriftField; atVerify: number; now: number }[] }
export function computeCashDay(input: CashDayInput): CashDayTotals;
```

- [ ] **Step 1: Write the failing tests**

`src/server/branch-cash/compute-cash-day.spec.ts`:

```ts
import { computeCashDay, type CashDayInput } from './compute-cash-day';

function input(overrides: Partial<CashDayInput> = {}): CashDayInput {
  return {
    sales: 12450,
    expenseAmounts: [850],
    valeAmounts: [500],
    actualCash: 11050,
    snapshot: null,
    ...overrides,
  };
}

describe('computeCashDay', () => {
  it('computes expected cash and a shortage (the spec example)', () => {
    expect(computeCashDay(input())).toEqual({
      sales: 12450,
      expenses: 850,
      vale: 500,
      expected: 11100,
      actualCash: 11050,
      overShort: -50,
      state: 'SHORT',
      drift: [],
    });
  });

  it('reports over and balanced', () => {
    expect(computeCashDay(input({ actualCash: 11100 })).state).toBe('BALANCED');
    const over = computeCashDay(input({ actualCash: 11120.5 }));
    expect(over).toMatchObject({ overShort: 20.5, state: 'OVER' });
  });

  it('is NOT_COUNTED with no over/short until cash is entered', () => {
    expect(computeCashDay(input({ actualCash: null }))).toMatchObject({
      actualCash: null,
      overShort: null,
      state: 'NOT_COUNTED',
      expected: 11100,
    });
  });

  it('adds in centavos, so 0.1 + 0.2 is exactly 0.3', () => {
    const t = computeCashDay(input({ sales: 0.3, expenseAmounts: [0.1, 0.2], valeAmounts: [], actualCash: 0 }));
    expect(t).toMatchObject({ expenses: 0.3, expected: 0, overShort: 0, state: 'BALANCED' });
  });

  it('allows a negative expected figure when spending exceeds sales', () => {
    const t = computeCashDay(input({ sales: 100, expenseAmounts: [300], valeAmounts: [], actualCash: 0 }));
    expect(t).toMatchObject({ expected: -200, overShort: 200, state: 'OVER' });
  });

  it('flags only the figures that moved since verification', () => {
    const snapshot = { sales: 12450, expenses: 850, vale: 500 };
    expect(computeCashDay(input({ snapshot })).drift).toEqual([]);
    expect(computeCashDay(input({ sales: 12510, snapshot })).drift).toEqual([
      { field: 'sales', atVerify: 12450, now: 12510 },
    ]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/server/branch-cash/compute-cash-day.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/branch-cash/compute-cash-day.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/server/branch-cash/compute-cash-day.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/branch-cash/compute-cash-day.ts src/server/branch-cash/compute-cash-day.spec.ts
git commit -m "feat(branch-cash): pure expected-cash and over/short computation" -m "<trailer>"
```

---

### Task 4: Audit entities and DTOs

**Files:**
- Modify: `src/server/common/utils/audit.util.ts`
- Modify: `src/server/common/utils/audit.util.spec.ts`
- Create: `src/server/branch-cash/dto/branch-cash.dto.ts`
- Test: `src/server/branch-cash/dto/dto-validation.spec.ts`

**Interfaces:**
- Consumes: `IsCalendarDate`, `MAX_MONEY` from `src/server/common/validators/payroll.validators.ts`.
- Produces:
  - `AuditEntity` gains `'ExpenseCategory' | 'BranchExpense' | 'BranchVale' | 'BranchCashDay'`.
  - DTO classes: `CreateExpenseDto { branchId; date; categoryId; amount; note? }`, `UpdateExpenseDto { branchId?; categoryId?; amount?; note? }`, `CreateValeDto { branchId; date; employeeId; amount; note? }`, `UpdateValeDto { branchId?; employeeId?; amount?; note? }`, `SetActualCashDto { branchId; date; actualCash: number | null; note? }`, `CashDayRefDto { branchId; date }`, `DayQueryDto { branchId; date }`, `SummaryQueryDto { from; to; branchId?; unverified? }`, `CreateCategoryDto { name; requiresNote?; sortOrder? }`, `UpdateCategoryDto { name?; requiresNote?; sortOrder?; isActive? }`.

- [ ] **Step 1: Write the failing audit test**

Add to `src/server/common/utils/audit.util.spec.ts`:

```ts
describe('branch cash entities', () => {
  it('records a voided expense and a verified day', () => {
    const before = { amount: 850, note: null, deletedAt: null, categoryId: 2 };
    const deletedAt = new Date('2026-10-02T01:00:00.000Z');
    expect(diffFields('BranchExpense', before, { ...before, deletedAt })).toEqual({
      deletedAt: [null, '2026-10-02T01:00:00.000Z'],
    });
    expect(
      diffFields('BranchCashDay', { status: 'OPEN', salesAtVerify: null }, { status: 'VERIFIED', salesAtVerify: 12450 }),
    ).toEqual({ status: ['OPEN', 'VERIFIED'], salesAtVerify: [null, 12450] });
  });
});
```

Run: `npx jest src/server/common/utils/audit.util.spec.ts`
Expected: FAIL — TypeScript rejects `'BranchExpense'` as an `AuditEntity`.

- [ ] **Step 2: Extend the audit util**

In `src/server/common/utils/audit.util.ts`, add to the `AuditEntity` union (after the payroll members):

```ts
  | 'ExpenseCategory'
  | 'BranchExpense'
  | 'BranchVale'
  | 'BranchCashDay';
```

and to `AUDITED_FIELDS`:

```ts
  ExpenseCategory: ['name', 'sortOrder', 'isActive', 'requiresNote'],
  BranchExpense: ['branchId', 'date', 'categoryId', 'amount', 'note', 'deletedAt'],
  BranchVale: ['branchId', 'date', 'employeeId', 'amount', 'note', 'deletedAt'],
  BranchCashDay: ['actualCash', 'note', 'status', 'salesAtVerify', 'expensesAtVerify', 'valeAtVerify'],
```

Update the file's top comment's first line to: `Change history for stock figures, payroll and branch cash records (the AuditEvent table).`

Run: `npx jest src/server/common/utils/audit.util.spec.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing DTO tests**

`src/server/branch-cash/dto/dto-validation.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateExpenseDto,
  CreateValeDto,
  DayQueryDto,
  SetActualCashDto,
  SummaryQueryDto,
  UpdateExpenseDto,
} from './branch-cash.dto';

async function errors<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const found = await validate(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true });
  return found.map((e) => e.property);
}

const expense = { branchId: 3, date: '2026-10-01', categoryId: 2, amount: 850, note: 'LPG refill' };

describe('branch cash DTOs', () => {
  it('accepts a valid expense', async () => {
    expect(await errors(CreateExpenseDto, expense)).toEqual([]);
  });

  it.each([0, -5, 12.345, 10_000_000_000])('rejects amount %p', async (amount) => {
    expect(await errors(CreateExpenseDto, { ...expense, amount })).toEqual(['amount']);
  });

  it.each(['2026-02-30', '2026-9-1', 'yesterday'])('rejects date %p', async (date) => {
    expect(await errors(CreateExpenseDto, { ...expense, date })).toEqual(['date']);
  });

  it('lets an edit carry the branchId BranchGuard stamps, and nothing else unknown', async () => {
    expect(await errors(UpdateExpenseDto, { branchId: 3, amount: 900 })).toEqual([]);
    expect(await errors(UpdateExpenseDto, { amount: 900, date: '2026-10-02' })).toEqual(['date']);
  });

  it('requires an employee on a vale', async () => {
    const { categoryId: _c, ...base } = expense;
    expect(await errors(CreateValeDto, base)).toEqual(['employeeId']);
  });

  it('accepts null to clear the counted cash, and zero', async () => {
    const ref = { branchId: 3, date: '2026-10-01' };
    expect(await errors(SetActualCashDto, { ...ref, actualCash: null })).toEqual([]);
    expect(await errors(SetActualCashDto, { ...ref, actualCash: 0 })).toEqual([]);
    expect(await errors(SetActualCashDto, ref)).toEqual(['actualCash']);
    expect(await errors(SetActualCashDto, { ...ref, actualCash: -1 })).toEqual(['actualCash']);
  });

  it('turns query strings into numbers', async () => {
    const q = plainToInstance(DayQueryDto, { branchId: '3', date: '2026-10-01' });
    expect(q.branchId).toBe(3);
    expect(await errors(SummaryQueryDto, { from: '2026-09-01', to: '2026-09-30', unverified: 'yes' })).toEqual([
      'unverified',
    ]);
  });
});
```

Run: `npx jest src/server/branch-cash/dto/dto-validation.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the DTOs**

`src/server/branch-cash/dto/branch-cash.dto.ts`:

```ts
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate, MAX_MONEY } from '../../common/validators/payroll.validators';

const MONEY = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false } as const;

class BranchDayDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  branchId: number;

  @IsCalendarDate()
  date: string;
}

export class CashDayRefDto extends BranchDayDto {}
export class DayQueryDto extends BranchDayDto {}

export class CreateExpenseDto extends BranchDayDto {
  @IsInt()
  @IsPositive()
  categoryId: number;

  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

/**
 * An edit. The date and branch of a line never change — void and re-add
 * instead. `branchId` is accepted only because BranchGuard stamps it into every
 * scoped user's body, and forbidNonWhitelisted would otherwise refuse the edit.
 */
export class UpdateExpenseDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  categoryId?: number;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class CreateValeDto extends BranchDayDto {
  @IsInt()
  @IsPositive()
  employeeId: number;

  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

/** See UpdateExpenseDto for why `branchId` is here. */
export class UpdateValeDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  employeeId?: number;

  @IsOptional()
  @IsNumber(MONEY)
  @Min(0.01)
  @Max(MAX_MONEY)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SetActualCashDto extends BranchDayDto {
  /** The counted cash, or null to clear it. Zero is a real count. */
  @ValidateIf((o: SetActualCashDto) => o.actualCash !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  actualCash: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class SummaryQueryDto {
  @IsCalendarDate()
  from: string;

  @IsCalendarDate()
  to: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  branchId?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  unverified?: string;
}

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsOptional()
  @IsBoolean()
  requiresNote?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 5: Run the DTO tests**

Run: `npx jest src/server/branch-cash/dto/dto-validation.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/common/utils/audit.util.ts src/server/common/utils/audit.util.spec.ts src/server/branch-cash/dto
git commit -m "feat(branch-cash): audit entities and request DTOs" -m "<trailer>"
```

---

### Task 5: Day lock and expense categories

**Files:**
- Create: `src/server/branch-cash/branch-cash-lock.util.ts`
- Test: `src/server/branch-cash/branch-cash-lock.util.spec.ts`
- Create: `src/server/branch-cash/expense-categories.service.ts`
- Test: `src/server/branch-cash/expense-categories.service.spec.ts`

**Interfaces:**
- Consumes: `toUtcDay`; `manilaToday`; `recordChanges`; `CreateCategoryDto`, `UpdateCategoryDto` (Task 4).
- Produces:
  - `lockCashDay(tx, branchId: number, date: string): Promise<void>`
  - `assertDayOpen(tx, branchId: number, date: string): Promise<void>` — takes the lock; `ConflictException` when `VERIFIED`
  - `assertNotFuture(date: string, now?: Date): void` — `BadRequestException` when after Manila today
  - `ExpenseCategoriesService`: `list(includeInactive?: boolean)`, `create(dto, userId)`, `update(id, dto, userId)`

- [ ] **Step 1: Write the failing lock tests**

`src/server/branch-cash/branch-cash-lock.util.spec.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertDayOpen, assertNotFuture } from './branch-cash-lock.util';

function fakeTx(status: 'OPEN' | 'VERIFIED' | null = null) {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    branchCashDay: { findUnique: jest.fn().mockResolvedValue(status ? { status } : null) },
  };
}

describe('branch cash day lock', () => {
  it('takes the advisory lock before reading the day', async () => {
    const tx = fakeTx();
    await assertDayOpen(tx as never, 3, '2026-10-01');
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.branchCashDay.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.branchCashDay.findUnique).toHaveBeenCalledWith({
      where: { branchId_date: { branchId: 3, date: new Date('2026-10-01T00:00:00.000Z') } },
      select: { status: true },
    });
  });

  it('passes an open day and a day with no record', async () => {
    await expect(assertDayOpen(fakeTx('OPEN') as never, 3, '2026-10-01')).resolves.toBeUndefined();
    await expect(assertDayOpen(fakeTx(null) as never, 3, '2026-10-01')).resolves.toBeUndefined();
  });

  it('refuses a verified day', async () => {
    await expect(assertDayOpen(fakeTx('VERIFIED') as never, 3, '2026-10-01')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('assertNotFuture', () => {
  // 2026-09-30 16:30 UTC is 00:30 on Oct 1 in Manila — the early baking shift.
  const justAfterMidnightManila = new Date('2026-09-30T16:30:00.000Z');

  it('accepts the Manila today even while UTC is still on yesterday', () => {
    expect(() => assertNotFuture('2026-10-01', justAfterMidnightManila)).not.toThrow();
  });

  it('accepts past days and refuses tomorrow', () => {
    expect(() => assertNotFuture('2026-09-15', justAfterMidnightManila)).not.toThrow();
    expect(() => assertNotFuture('2026-10-02', justAfterMidnightManila)).toThrow(BadRequestException);
  });
});
```

Run: `npx jest src/server/branch-cash/branch-cash-lock.util.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement the lock util**

`src/server/branch-cash/branch-cash-lock.util.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { manilaToday } from '@/lib/manilaDate';
import { toUtcDay } from '../common/utils/date-range.util';

type Tx = Prisma.TransactionClient;

/**
 * A verified branch-day is signed off: its expenses, vale and counted cash
 * cannot change until an admin reopens it.
 *
 * Every writer, and verify/reopen, takes a transaction-scoped advisory lock on
 * the branch-day first — so a write cannot slip in between verify's snapshot and
 * its status change, even before a BranchCashDay row exists (a row lock could
 * not cover that). Namespace 5: stock-chain.ts uses 1–3, payroll 4.
 */
const BRANCH_CASH_LOCK_NS = 5;

export async function lockCashDay(tx: Tx, branchId: number, date: string): Promise<void> {
  const key = `${branchId}|${date}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BRANCH_CASH_LOCK_NS}::int, hashtext(${key}))`;
}

/** Locks the branch-day and throws if it is verified. */
export async function assertDayOpen(tx: Tx, branchId: number, date: string): Promise<void> {
  await lockCashDay(tx, branchId, date);
  const day = await tx.branchCashDay.findUnique({
    where: { branchId_date: { branchId, date: toUtcDay(date) } },
    select: { status: true },
  });
  if (day?.status === 'VERIFIED') {
    throw new ConflictException('This day is verified. Ask an admin to reopen it.');
  }
}

/** Past days are fine — managers often catch up the next morning. */
export function assertNotFuture(date: string, now: Date = new Date()): void {
  if (date > manilaToday(now)) {
    throw new BadRequestException('The date cannot be in the future.');
  }
}
```

Run: `npx jest src/server/branch-cash/branch-cash-lock.util.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Write the failing category tests**

`src/server/branch-cash/expense-categories.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service';

function fakeDb() {
  const db = {
    expenseCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 9, isActive: true, ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 9, name: 'Ice', ...data })),
    },
    auditEvent: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

describe('ExpenseCategoriesService', () => {
  it('lists active categories in sort order unless asked for all', async () => {
    const db = fakeDb();
    const service = new ExpenseCategoriesService(db as never);
    await service.list();
    expect(db.expenseCategory.findMany).toHaveBeenLastCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    await service.list(true);
    expect(db.expenseCategory.findMany.mock.calls[1][0].where).toEqual({ deletedAt: null });
  });

  it('creates a trimmed name and audits it', async () => {
    const db = fakeDb();
    const row = await new ExpenseCategoriesService(db as never).create({ name: '  Ice  ' }, 1);
    expect(db.expenseCategory.create).toHaveBeenCalledWith({
      data: { name: 'Ice', requiresNote: false, sortOrder: 0 },
    });
    expect(row.name).toBe('Ice');
    expect(db.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses a name that differs only in case', async () => {
    const db = fakeDb();
    db.expenseCategory.findFirst.mockResolvedValue({ id: 2 });
    await expect(new ExpenseCategoriesService(db as never).create({ name: 'utilities' }, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.expenseCategory.findFirst).toHaveBeenCalledWith({
      where: { deletedAt: null, name: { equals: 'utilities', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  it('deactivates rather than deletes', async () => {
    const db = fakeDb();
    db.expenseCategory.findFirst.mockResolvedValueOnce({ id: 9, name: 'Ice', isActive: true });
    await new ExpenseCategoriesService(db as never).update(9, { isActive: false }, 1);
    expect(db.expenseCategory.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { isActive: false } });
  });

  it('404s an unknown category', async () => {
    const db = fakeDb();
    await expect(new ExpenseCategoriesService(db as never).update(99, { isActive: false }, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

Run: `npx jest src/server/branch-cash/expense-categories.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the category service**

`src/server/branch-cash/expense-categories.service.ts`:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/branch-cash.dto';

type Tx = Prisma.TransactionClient;

/** The short list a manager picks from. Deactivated, never deleted. */
@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.expenseCategory.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(dto: CreateCategoryDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const name = dto.name.trim();
      await this.assertNameFree(tx, name);
      const row = await tx.expenseCategory.create({
        data: { name, requiresNote: dto.requiresNote ?? false, sortOrder: dto.sortOrder ?? 0 },
      });
      await recordChanges(tx, [{ entity: 'ExpenseCategory', entityId: row.id, before: null, after: row }], userId);
      return row;
    });
  }

  update(id: number, dto: UpdateCategoryDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.expenseCategory.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Category not found');
      const data: Prisma.ExpenseCategoryUpdateInput = {};
      if (dto.name !== undefined) {
        data.name = dto.name.trim();
        await this.assertNameFree(tx, data.name, id);
      }
      if (dto.requiresNote !== undefined) data.requiresNote = dto.requiresNote;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      const after = await tx.expenseCategory.update({ where: { id }, data });
      await recordChanges(tx, [{ entity: 'ExpenseCategory', entityId: id, before, after }], userId);
      return after;
    });
  }

  /** Case-insensitive: "utilities" next to "Utilities" is a typo, not a category. */
  private async assertNameFree(tx: Tx, name: string, exceptId?: number) {
    const clash = await tx.expenseCategory.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId != null ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A category named "${name}" already exists.`);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/server/branch-cash/expense-categories.service.spec.ts src/server/branch-cash/branch-cash-lock.util.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/branch-cash/branch-cash-lock.util.ts src/server/branch-cash/branch-cash-lock.util.spec.ts src/server/branch-cash/expense-categories.service.ts src/server/branch-cash/expense-categories.service.spec.ts
git commit -m "feat(branch-cash): branch-day advisory lock and expense categories" -m "<trailer>"
```

---

### Task 6: Expenses, vale and the counted cash

**Files:**
- Create: `src/server/branch-cash/branch-cash-entries.service.ts`
- Test: `src/server/branch-cash/branch-cash-entries.service.spec.ts`

**Interfaces:**
- Consumes: `assertDayOpen`, `assertNotFuture` (Task 5); `assertCutoffOpen`, `day` from `../payroll/payroll-lock.util`; `cutoffOf` from `@/lib/payroll/cutoff`; `recordChanges`; `toUtcDay`; DTOs (Task 4).
- Produces: `BranchCashEntriesService` with
  - `createExpense(dto: CreateExpenseDto, userId: number)`
  - `updateExpense(id: number, dto: UpdateExpenseDto, scopeBranchId: number | undefined, userId: number)`
  - `voidExpense(id: number, scopeBranchId: number | undefined, userId: number): Promise<{ id: number }>`
  - `createVale(dto: CreateValeDto, userId: number)`
  - `updateVale(id: number, dto: UpdateValeDto, scopeBranchId: number | undefined, userId: number)`
  - `voidVale(id: number, scopeBranchId: number | undefined, userId: number): Promise<{ id: number }>`
  - `setActualCash(dto: SetActualCashDto, userId: number)`

- [ ] **Step 1: Write the failing tests**

`src/server/branch-cash/branch-cash-entries.service.spec.ts`:

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BranchCashEntriesService } from './branch-cash-entries.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function fakeDb() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    branchCashDay: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => ({ id: 70, status: 'OPEN', ...create })),
    },
    branchExpense: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 11, deletedAt: null, ...data })),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 11, ...data })),
    },
    branchVale: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 21, deletedAt: null, ...data })),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 21, ...data })),
    },
    expenseCategory: {
      findFirst: jest.fn().mockResolvedValue({ name: 'Utilities', requiresNote: false }),
    },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
    payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
    auditEvent: { createMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { tx, service: new BranchCashEntriesService(prisma as never) };
}

const expense = { branchId: 3, date: '2026-10-01', categoryId: 2, amount: 850, note: '  LPG  ' };
const vale = { branchId: 3, date: '2026-10-01', employeeId: 5, amount: 500 };
const expenseRow = { id: 11, branchId: 3, date: at('2026-10-01'), categoryId: 2, amount: 850, note: 'LPG', deletedAt: null };
const valeRow = { id: 21, branchId: 3, date: at('2026-10-01'), employeeId: 5, amount: 500, note: null, deletedAt: null };

describe('BranchCashEntriesService — expenses', () => {
  it('records an expense with a trimmed note, under the day lock, and audits it', async () => {
    const { tx, service } = fakeDb();
    await service.createExpense(expense, 1);
    expect(tx.branchExpense.create).toHaveBeenCalledWith({
      data: { branchId: 3, date: at('2026-10-01'), categoryId: 2, amount: 850, note: 'LPG', createdById: 1 },
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.branchExpense.create.mock.invocationCallOrder[0],
    );
    expect(tx.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses a verified day', async () => {
    const { tx, service } = fakeDb();
    tx.branchCashDay.findUnique.mockResolvedValue({ status: 'VERIFIED' });
    await expect(service.createExpense(expense, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.branchExpense.create).not.toHaveBeenCalled();
  });

  it('refuses a future date before opening a transaction', async () => {
    const { tx, service } = fakeDb();
    await expect(service.createExpense({ ...expense, date: '2999-01-01' }, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses an inactive category', async () => {
    const { tx, service } = fakeDb();
    tx.expenseCategory.findFirst.mockResolvedValue(null);
    await expect(service.createExpense(expense, 1)).rejects.toThrow('Pick an active expense category.');
  });

  it('requires a note where the category says so', async () => {
    const { tx, service } = fakeDb();
    tx.expenseCategory.findFirst.mockResolvedValue({ name: 'Other', requiresNote: true });
    await expect(service.createExpense({ ...expense, note: '   ' }, 1)).rejects.toThrow(
      'Add a note for "Other" expenses.',
    );
  });

  it('404s another branch’s expense for a scoped user and writes nothing', async () => {
    const { tx, service } = fakeDb();
    tx.branchExpense.findFirst.mockResolvedValue(null);
    await expect(service.updateExpense(11, { amount: 900 }, 3, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.branchExpense.findFirst.mock.calls[0][0].where).toEqual({ id: 11, deletedAt: null, branchId: 3 });
    expect(tx.branchExpense.update).not.toHaveBeenCalled();
  });

  it('edits the amount, keeping a category deactivated since', async () => {
    const { tx, service } = fakeDb();
    tx.branchExpense.findFirst.mockResolvedValue(expenseRow);
    await service.updateExpense(11, { amount: 900 }, undefined, 1);
    expect(tx.expenseCategory.findFirst.mock.calls[0][0].where).toEqual({ id: 2, deletedAt: null });
    expect(tx.branchExpense.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { categoryId: 2, note: 'LPG', amount: 900, updatedById: 1 },
    });
  });

  it('voids by stamping deletedAt, never deleting', async () => {
    const { tx, service } = fakeDb();
    tx.branchExpense.findFirst.mockResolvedValue(expenseRow);
    await expect(service.voidExpense(11, undefined, 1)).resolves.toEqual({ id: 11 });
    const { data } = tx.branchExpense.update.mock.calls[0][0];
    expect(data.deletedById).toBe(1);
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(tx.auditEvent.createMany.mock.calls[0][0].data[0].action).toBe('delete');
  });
});

describe('BranchCashEntriesService — vale', () => {
  it('records a vale for an employee employed that day', async () => {
    const { tx, service } = fakeDb();
    await service.createVale(vale, 1);
    expect(tx.employee.findFirst).toHaveBeenCalledWith({
      where: {
        id: 5,
        deletedAt: null,
        hiredOn: { lte: at('2026-10-01') },
        OR: [{ separatedOn: null }, { separatedOn: { gte: at('2026-10-01') } }],
      },
      select: { id: true },
    });
    expect(tx.branchVale.create).toHaveBeenCalledWith({
      data: { branchId: 3, date: at('2026-10-01'), employeeId: 5, amount: 500, note: null, createdById: 1 },
    });
  });

  it('refuses an employee not employed on that day', async () => {
    const { tx, service } = fakeDb();
    tx.employee.findFirst.mockResolvedValue(null);
    await expect(service.createVale(vale, 1)).rejects.toThrow('That employee was not employed on this date.');
  });

  it('refuses a vale in a finalized payroll cutoff', async () => {
    const { tx, service } = fakeDb();
    tx.payrollRun.findFirst.mockResolvedValue({ id: 1 });
    await expect(service.createVale(vale, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payrollRun.findFirst.mock.calls[0][0].where.periodStart).toEqual(at('2026-10-01'));
    expect(tx.branchVale.create).not.toHaveBeenCalled();
  });

  it('refuses to void a vale once its cutoff is finalized', async () => {
    const { tx, service } = fakeDb();
    tx.branchVale.findFirst.mockResolvedValue({ ...valeRow, date: at('2026-10-20') });
    tx.payrollRun.findFirst.mockResolvedValue({ id: 1 });
    await expect(service.voidVale(21, undefined, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payrollRun.findFirst.mock.calls[0][0].where.periodStart).toEqual(at('2026-10-16'));
    expect(tx.branchVale.update).not.toHaveBeenCalled();
  });

  it('checks the new employee when a vale is reassigned', async () => {
    const { tx, service } = fakeDb();
    tx.branchVale.findFirst.mockResolvedValue(valeRow);
    await service.updateVale(21, { employeeId: 8 }, undefined, 1);
    expect(tx.employee.findFirst.mock.calls[0][0].where.id).toBe(8);
    expect(tx.branchVale.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { employeeId: 8, note: null, updatedById: 1 },
    });
  });
});

describe('BranchCashEntriesService — counted cash', () => {
  it('upserts the counted cash for the branch-day', async () => {
    const { tx, service } = fakeDb();
    await service.setActualCash({ branchId: 3, date: '2026-10-01', actualCash: 11050 }, 1);
    expect(tx.branchCashDay.upsert).toHaveBeenCalledWith({
      where: { branchId_date: { branchId: 3, date: at('2026-10-01') } },
      create: { branchId: 3, date: at('2026-10-01'), actualCash: 11050, note: null },
      update: { actualCash: 11050, note: null },
    });
  });

  it('clears the count with null', async () => {
    const { tx, service } = fakeDb();
    tx.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN', actualCash: 11050, note: 'late' });
    await service.setActualCash({ branchId: 3, date: '2026-10-01', actualCash: null }, 1);
    expect(tx.branchCashDay.upsert.mock.calls[0][0].update).toEqual({ actualCash: null, note: 'late' });
  });

  it('refuses a verified day', async () => {
    const { tx, service } = fakeDb();
    tx.branchCashDay.findUnique.mockResolvedValue({ status: 'VERIFIED' });
    await expect(
      service.setActualCash({ branchId: 3, date: '2026-10-01', actualCash: 1 }, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/server/branch-cash/branch-cash-entries.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/branch-cash/branch-cash-entries.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cutoffOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { assertCutoffOpen, day } from '../payroll/payroll-lock.util';
import { assertDayOpen, assertNotFuture } from './branch-cash-lock.util';
import type {
  CreateExpenseDto,
  CreateValeDto,
  SetActualCashDto,
  UpdateExpenseDto,
  UpdateValeDto,
} from './dto/branch-cash.dto';

type Tx = Prisma.TransactionClient;

const clean = (note?: string | null) => note?.trim() || null;
const scoped = (id: number, scopeBranchId?: number) => ({
  id,
  deletedAt: null,
  ...(scopeBranchId != null ? { branchId: scopeBranchId } : {}),
});

/**
 * Category must be active only when it is being chosen: an edit to an old
 * line's amount must not fail because its category was retired since.
 */
async function requireCategory(tx: Tx, id: number, note: string | null, mustBeActive: boolean) {
  const category = await tx.expenseCategory.findFirst({
    where: { id, deletedAt: null, ...(mustBeActive ? { isActive: true } : {}) },
    select: { name: true, requiresNote: true },
  });
  if (!category) throw new BadRequestException('Pick an active expense category.');
  if (category.requiresNote && !note) {
    throw new BadRequestException(`Add a note for "${category.name}" expenses.`);
  }
}

/** Payroll deducts the vale in this employee's cutoff, so they must be on the books that day. */
async function requireEmployee(tx: Tx, employeeId: number, date: string) {
  const d = toUtcDay(date);
  const employee = await tx.employee.findFirst({
    where: {
      id: employeeId,
      deletedAt: null,
      hiredOn: { lte: d },
      OR: [{ separatedOn: null }, { separatedOn: { gte: d } }],
    },
    select: { id: true },
  });
  if (!employee) throw new BadRequestException('That employee was not employed on this date.');
}

/**
 * The drawer lines of the paper sheet: expenses, vale and the counted cash.
 *
 * Every write runs in one transaction that first takes the branch-day lock and
 * refuses a verified day. Vale writes also take payroll's cutoff lock and refuse
 * a finalized cutoff, because the vale is already on a payslip.
 */
@Injectable()
export class BranchCashEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Expenses ───────────────────────────────────────────────────────────────

  createExpense(dto: CreateExpenseDto, userId: number) {
    assertNotFuture(dto.date);
    return this.prisma.$transaction(async (tx) => {
      await assertDayOpen(tx, dto.branchId, dto.date);
      const note = clean(dto.note);
      await requireCategory(tx, dto.categoryId, note, true);
      const row = await tx.branchExpense.create({
        data: {
          branchId: dto.branchId,
          date: toUtcDay(dto.date),
          categoryId: dto.categoryId,
          amount: dto.amount,
          note,
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchExpense', entityId: row.id, before: null, after: row }], userId);
      return row;
    });
  }

  updateExpense(id: number, dto: UpdateExpenseDto, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedExpense(tx, id, scopeBranchId);
      const note = dto.note === undefined ? before.note : clean(dto.note);
      const categoryId = dto.categoryId ?? before.categoryId;
      await requireCategory(tx, categoryId, note, categoryId !== before.categoryId);
      const after = await tx.branchExpense.update({
        where: { id },
        data: {
          categoryId,
          note,
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          updatedById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchExpense', entityId: id, before, after }], userId);
      return after;
    });
  }

  voidExpense(id: number, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedExpense(tx, id, scopeBranchId);
      const after = await tx.branchExpense.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });
      await recordChanges(
        tx,
        [{ entity: 'BranchExpense', entityId: id, before, after, action: 'delete' }],
        userId,
      );
      return { id };
    });
  }

  /** Find (scoped), lock its day, then re-read: a concurrent void is seen after the lock. */
  private async lockedExpense(tx: Tx, id: number, scopeBranchId?: number) {
    const where = scoped(id, scopeBranchId);
    const found = await tx.branchExpense.findFirst({ where });
    if (!found) throw new NotFoundException('Expense not found');
    await assertDayOpen(tx, found.branchId, day(found.date));
    const row = await tx.branchExpense.findFirst({ where });
    if (!row) throw new NotFoundException('Expense not found');
    return row;
  }

  // ── Vale ───────────────────────────────────────────────────────────────────

  createVale(dto: CreateValeDto, userId: number) {
    assertNotFuture(dto.date);
    return this.prisma.$transaction(async (tx) => {
      await assertDayOpen(tx, dto.branchId, dto.date);
      await assertCutoffOpen(tx, cutoffOf(dto.date).periodStart);
      await requireEmployee(tx, dto.employeeId, dto.date);
      const row = await tx.branchVale.create({
        data: {
          branchId: dto.branchId,
          date: toUtcDay(dto.date),
          employeeId: dto.employeeId,
          amount: dto.amount,
          note: clean(dto.note),
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchVale', entityId: row.id, before: null, after: row }], userId);
      return row;
    });
  }

  updateVale(id: number, dto: UpdateValeDto, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedVale(tx, id, scopeBranchId);
      const employeeId = dto.employeeId ?? before.employeeId;
      if (employeeId !== before.employeeId) await requireEmployee(tx, employeeId, day(before.date));
      const after = await tx.branchVale.update({
        where: { id },
        data: {
          employeeId,
          note: dto.note === undefined ? before.note : clean(dto.note),
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          updatedById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchVale', entityId: id, before, after }], userId);
      return after;
    });
  }

  voidVale(id: number, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedVale(tx, id, scopeBranchId);
      const after = await tx.branchVale.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });
      await recordChanges(
        tx,
        [{ entity: 'BranchVale', entityId: id, before, after, action: 'delete' }],
        userId,
      );
      return { id };
    });
  }

  /** As lockedExpense, plus the payroll cutoff: a vale on a finalized payslip is fixed. */
  private async lockedVale(tx: Tx, id: number, scopeBranchId?: number) {
    const where = scoped(id, scopeBranchId);
    const found = await tx.branchVale.findFirst({ where });
    if (!found) throw new NotFoundException('Vale not found');
    const date = day(found.date);
    await assertDayOpen(tx, found.branchId, date);
    await assertCutoffOpen(tx, cutoffOf(date).periodStart);
    const row = await tx.branchVale.findFirst({ where });
    if (!row) throw new NotFoundException('Vale not found');
    return row;
  }

  // ── Counted cash ───────────────────────────────────────────────────────────

  setActualCash(dto: SetActualCashDto, userId: number) {
    assertNotFuture(dto.date);
    return this.prisma.$transaction(async (tx) => {
      await assertDayOpen(tx, dto.branchId, dto.date);
      const date = toUtcDay(dto.date);
      const key = { branchId_date: { branchId: dto.branchId, date } };
      const before = await tx.branchCashDay.findUnique({ where: key });
      const note = dto.note === undefined ? (before?.note ?? null) : clean(dto.note);
      const after = await tx.branchCashDay.upsert({
        where: key,
        create: { branchId: dto.branchId, date, actualCash: dto.actualCash, note },
        update: { actualCash: dto.actualCash, note },
      });
      await recordChanges(tx, [{ entity: 'BranchCashDay', entityId: after.id, before, after }], userId);
      return after;
    });
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx jest src/server/branch-cash/branch-cash-entries.service.spec.ts`
Expected: PASS (15 tests). If the "records a vale" test sees `payrollRun.findFirst` called with a `periodStart` other than Oct 1, `cutoffOf` is being given a Date instead of the `YYYY-MM-DD` string.

- [ ] **Step 5: Commit**

```bash
git add src/server/branch-cash/branch-cash-entries.service.ts src/server/branch-cash/branch-cash-entries.service.spec.ts
git commit -m "feat(branch-cash): expenses, vale and counted cash under day and payroll locks" -m "<trailer>"
```

---

### Task 7: Day view, period summary, verify and reopen

**Files:**
- Modify: `src/server/sales/sales.module.ts`
- Create: `src/server/branch-cash/branch-cash-days.service.ts`
- Test: `src/server/branch-cash/branch-cash-days.service.spec.ts`

**Interfaces:**
- Consumes: `SalesService.getByBranchAndDate(branchId, date)` → `{ totals: { totalSales } }`, `SalesService.getDailySummary(branchId, start, end)` → `{ branchId, dailySummary: { date, totalSales }[] }`; `computeCashDay` (Task 3); `lockCashDay` (Task 5); `day`; `assertDateRange`, `MAX_REPORT_RANGE_DAYS`, `toUtcDay`; `recordChanges`; `num`, `centavos`, `pesos`.
- Produces:
  ```ts
  export interface CashDayView {
    branchId: number; date: string; status: 'OPEN' | 'VERIFIED';
    verifiedAt: string | null; verifiedBy: string | null; note: string | null;
    expenses: { id: number; category: { id: number; name: string }; amount: number; note: string | null }[];
    vale: { id: number; employee: { id: number; name: string }; amount: number; note: string | null }[];
    totals: CashDayTotals;
  }
  export interface CashSummaryRow { branchId: number; branchName: string; date: string; status: 'OPEN' | 'VERIFIED'; totals: CashDayTotals }
  export interface CashSummary {
    rows: CashSummaryRow[];
    totals: { sales: number; expenses: number; vale: number; expected: number; actualCash: number; overShort: number; days: number; unverifiedDays: number; notCountedDays: number };
  }
  export interface ValeEmployeeOption { id: number; name: string; branchId: number | null }
  ```
  `BranchCashDaysService`: `getDay(branchId, date)`, `summary({ from, to, branchId?, unverified? })`, `verify(branchId, date, userId)`, `reopen(branchId, date, userId)`, `employeesFor(branchId, date)`.
  `SalesModule` exports `SalesService`.

- [ ] **Step 1: Export `SalesService`**

`src/server/sales/sales.module.ts`:

```ts
@Module({
  controllers: [SalesController],
  providers: [SalesService],
  // Branch cash reads the day's sales from here, so the figure always matches
  // the sales page.
  exports: [SalesService],
})
export class SalesModule {}
```

- [ ] **Step 2: Write the failing tests**

`src/server/branch-cash/branch-cash-days.service.spec.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BranchCashDaysService } from './branch-cash-days.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function fakeDb() {
  const db = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
    branch: { findMany: jest.fn().mockResolvedValue([]) },
    branchExpense: { findMany: jest.fn().mockResolvedValue([]) },
    branchVale: { findMany: jest.fn().mockResolvedValue([]) },
    branchCashDay: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 70, ...data })),
    },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'admin@louella.ph' }) },
    auditEvent: { createMany: jest.fn() },
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const sales = {
    getByBranchAndDate: jest.fn().mockResolvedValue({ totals: { totalSales: 12450 } }),
    getDailySummary: jest.fn(),
  };
  return { db, sales, service: new BranchCashDaysService(db as never, sales as never) };
}

describe('BranchCashDaysService.getDay', () => {
  it('puts sales, lines and the count together', async () => {
    const { db, service } = fakeDb();
    db.branchExpense.findMany.mockResolvedValue([
      { id: 11, amount: 850, note: 'LPG', category: { id: 2, name: 'Utilities' } },
    ]);
    db.branchVale.findMany.mockResolvedValue([
      { id: 21, amount: 500, note: null, employee: { id: 5, firstName: 'Ana', lastName: 'Cruz' } },
    ]);
    db.branchCashDay.findUnique.mockResolvedValue({ status: 'OPEN', actualCash: 11050, note: null, verifiedById: null });

    const view = await service.getDay(3, '2026-10-01');

    expect(view).toMatchObject({
      branchId: 3,
      date: '2026-10-01',
      status: 'OPEN',
      verifiedBy: null,
      expenses: [{ id: 11, category: { id: 2, name: 'Utilities' }, amount: 850, note: 'LPG' }],
      vale: [{ id: 21, employee: { id: 5, name: 'Ana Cruz' }, amount: 500, note: null }],
      totals: { sales: 12450, expected: 11100, overShort: -50, state: 'SHORT', drift: [] },
    });
    expect(db.branchExpense.findMany.mock.calls[0][0].where).toEqual({
      branchId: 3,
      date: at('2026-10-01'),
      deletedAt: null,
    });
  });

  it('shows who verified and what moved since', async () => {
    const { db, sales, service } = fakeDb();
    sales.getByBranchAndDate.mockResolvedValue({ totals: { totalSales: 12510 } });
    db.branchCashDay.findUnique.mockResolvedValue({
      status: 'VERIFIED',
      actualCash: 11050,
      note: null,
      verifiedById: 1,
      verifiedAt: new Date('2026-10-02T02:00:00.000Z'),
      salesAtVerify: 12450,
      expensesAtVerify: 0,
      valeAtVerify: 0,
    });
    const view = await service.getDay(3, '2026-10-01');
    expect(view.verifiedBy).toBe('admin@louella.ph');
    expect(view.totals.drift).toEqual([{ field: 'sales', atVerify: 12450, now: 12510 }]);
  });
});

describe('BranchCashDaysService.verify / reopen', () => {
  it('refuses to verify before the cash is counted', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN', actualCash: null });
    await expect(service.verify(3, '2026-10-01', 1)).rejects.toThrow('Enter the counted cash before verifying.');
    await expect(service.verify(3, '2026-10-02', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to verify twice', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'VERIFIED', actualCash: 1 });
    await expect(service.verify(3, '2026-10-01', 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('snapshots the live figures under the day lock', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN', actualCash: 11050 });
    db.branchExpense.findMany.mockResolvedValue([{ id: 11, amount: 850, note: null, category: { id: 2, name: 'U' } }]);
    await service.verify(3, '2026-10-01', 1);
    const { data } = db.branchCashDay.update.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'VERIFIED',
      verifiedById: 1,
      salesAtVerify: 12450,
      expensesAtVerify: 850,
      valeAtVerify: 0,
    });
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.branchCashDay.findUnique.mock.invocationCallOrder[0],
    );
    expect(db.auditEvent.createMany).toHaveBeenCalled();
  });

  it('reopens by clearing the snapshot, and only a verified day', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN' });
    await expect(service.reopen(3, '2026-10-01', 1)).rejects.toBeInstanceOf(ConflictException);

    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'VERIFIED' });
    await service.reopen(3, '2026-10-01', 1);
    expect(db.branchCashDay.update).toHaveBeenLastCalledWith({
      where: { id: 70 },
      data: {
        status: 'OPEN',
        verifiedById: null,
        verifiedAt: null,
        salesAtVerify: null,
        expensesAtVerify: null,
        valeAtVerify: null,
      },
    });
  });
});

describe('BranchCashDaysService.summary', () => {
  function withTwoBranches() {
    const ctx = fakeDb();
    ctx.db.branch.findMany.mockResolvedValue([
      { id: 1, name: 'Main' },
      { id: 2, name: 'Cubao' },
    ]);
    ctx.sales.getDailySummary.mockImplementation(async (branchId: number) => ({
      branchId,
      dailySummary: branchId === 1 ? [{ date: '2026-10-01', totalSales: 1000 }] : [],
    }));
    // Cubao spent on a day it had no inventory: the row must still appear.
    ctx.db.branchExpense.findMany.mockResolvedValue([{ branchId: 2, date: at('2026-10-02'), amount: 60 }]);
    ctx.db.branchCashDay.findMany.mockResolvedValue([
      { branchId: 1, date: at('2026-10-01'), status: 'VERIFIED', actualCash: 990, salesAtVerify: 1000, expensesAtVerify: 0, valeAtVerify: 0 },
    ]);
    return ctx;
  }

  it('merges sales days and cash-only days, newest first, with totals', async () => {
    const { service } = withTwoBranches();
    const summary = await service.summary({ from: '2026-10-01', to: '2026-10-07' });
    expect(summary.rows.map((r) => [r.branchName, r.date, r.status, r.totals.state])).toEqual([
      ['Cubao', '2026-10-02', 'OPEN', 'NOT_COUNTED'],
      ['Main', '2026-10-01', 'VERIFIED', 'SHORT'],
    ]);
    expect(summary.totals).toEqual({
      sales: 1000,
      expenses: 60,
      vale: 0,
      expected: 940,
      actualCash: 990,
      overShort: -10,
      days: 2,
      unverifiedDays: 1,
      notCountedDays: 1,
    });
  });

  it('filters to unverified days', async () => {
    const { service } = withTwoBranches();
    const summary = await service.summary({ from: '2026-10-01', to: '2026-10-07', unverified: true });
    expect(summary.rows.map((r) => r.branchName)).toEqual(['Cubao']);
  });

  it('limits to one branch when asked', async () => {
    const { db, service } = withTwoBranches();
    await service.summary({ from: '2026-10-01', to: '2026-10-07', branchId: 2 });
    expect(db.branch.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, id: 2 });
  });

  it('refuses a range longer than the report cap', async () => {
    const { service } = withTwoBranches();
    await expect(service.summary({ from: '2026-01-01', to: '2026-10-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('BranchCashDaysService.employeesFor', () => {
  it('lists people employed that day, the branch’s own first', async () => {
    const { db, service } = fakeDb();
    db.employee.findMany.mockResolvedValue([
      { id: 1, firstName: 'Ben', lastName: 'Abad', branchId: 2 },
      { id: 2, firstName: 'Ana', lastName: 'Cruz', branchId: 3 },
      { id: 3, firstName: 'Cy', lastName: 'Diaz', branchId: null },
    ]);
    expect(await service.employeesFor(3, '2026-10-01')).toEqual([
      { id: 2, name: 'Ana Cruz', branchId: 3 },
      { id: 1, name: 'Ben Abad', branchId: 2 },
      { id: 3, name: 'Cy Diaz', branchId: null },
    ]);
    expect(db.employee.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      hiredOn: { lte: at('2026-10-01') },
      OR: [{ separatedOn: null }, { separatedOn: { gte: at('2026-10-01') } }],
    });
  });
});
```

Run: `npx jest src/server/branch-cash/branch-cash-days.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/branch-cash/branch-cash-days.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type BranchCashDay } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { recordChanges } from '../common/utils/audit.util';
import { centavos, num, pesos } from '../common/utils/decimal.util';
import { MAX_REPORT_RANGE_DAYS, assertDateRange, toUtcDay } from '../common/utils/date-range.util';
import { day } from '../payroll/payroll-lock.util';
import { computeCashDay, type CashDayTotals, type CashSnapshot } from './compute-cash-day';
import { lockCashDay } from './branch-cash-lock.util';

type Db = Prisma.TransactionClient | PrismaService;
type Status = 'OPEN' | 'VERIFIED';

export interface CashDayView {
  branchId: number;
  date: string;
  status: Status;
  verifiedAt: string | null;
  verifiedBy: string | null;
  note: string | null;
  expenses: { id: number; category: { id: number; name: string }; amount: number; note: string | null }[];
  vale: { id: number; employee: { id: number; name: string }; amount: number; note: string | null }[];
  totals: CashDayTotals;
}

export interface CashSummaryRow {
  branchId: number;
  branchName: string;
  date: string;
  status: Status;
  totals: CashDayTotals;
}

export interface CashSummary {
  rows: CashSummaryRow[];
  totals: {
    sales: number;
    expenses: number;
    vale: number;
    expected: number;
    actualCash: number;
    overShort: number;
    days: number;
    unverifiedDays: number;
    notCountedDays: number;
  };
}

export interface ValeEmployeeOption {
  id: number;
  name: string;
  branchId: number | null;
}

type SnapshotFields = Pick<BranchCashDay, 'status' | 'salesAtVerify' | 'expensesAtVerify' | 'valeAtVerify'>;

function snapshotOf(row: SnapshotFields | null | undefined): CashSnapshot | null {
  if (row?.status !== 'VERIFIED') return null;
  return { sales: num(row.salesAtVerify), expenses: num(row.expensesAtVerify), vale: num(row.valeAtVerify) };
}

const amountOrNull = (value: Prisma.Decimal | number | null | undefined) => (value == null ? null : num(value));

/**
 * Reads and sign-off for a branch-day's drawer.
 *
 * Sales comes from SalesService so the figure here is the one on the sales
 * page. Expected cash and over/short come from computeCashDay, for one day
 * and for every row of a period alike.
 */
@Injectable()
export class BranchCashDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  async getDay(branchId: number, date: string): Promise<CashDayView> {
    const [sales, lines, cashDay] = await Promise.all([
      this.salesOn(branchId, date),
      this.lines(this.prisma, branchId, date),
      this.prisma.branchCashDay.findUnique({ where: { branchId_date: { branchId, date: toUtcDay(date) } } }),
    ]);
    const verifier = cashDay?.verifiedById
      ? await this.prisma.user.findUnique({ where: { id: cashDay.verifiedById }, select: { email: true } })
      : null;

    return {
      branchId,
      date,
      status: cashDay?.status ?? 'OPEN',
      verifiedAt: cashDay?.verifiedAt?.toISOString() ?? null,
      verifiedBy: verifier?.email ?? null,
      note: cashDay?.note ?? null,
      expenses: lines.expenses.map((e) => ({ id: e.id, category: e.category, amount: num(e.amount), note: e.note })),
      vale: lines.vale.map((v) => ({
        id: v.id,
        employee: { id: v.employee.id, name: `${v.employee.firstName} ${v.employee.lastName}` },
        amount: num(v.amount),
        note: v.note,
      })),
      totals: computeCashDay({
        sales,
        expenseAmounts: lines.expenses.map((e) => num(e.amount)),
        valeAmounts: lines.vale.map((v) => num(v.amount)),
        actualCash: amountOrNull(cashDay?.actualCash),
        snapshot: snapshotOf(cashDay),
      }),
    };
  }

  async summary(q: { from: string; to: string; branchId?: number; unverified?: boolean }): Promise<CashSummary> {
    const gte = toUtcDay(q.from);
    const lte = toUtcDay(q.to);
    assertDateRange(gte, lte, MAX_REPORT_RANGE_DAYS);

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, ...(q.branchId != null ? { id: q.branchId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const branchIds = branches.map((b) => b.id);
    const where = { branchId: { in: branchIds }, date: { gte, lte }, deletedAt: null };
    const amountSelect = { branchId: true, date: true, amount: true } as const;

    const [expenses, vale, cashDays, salesByBranch] = await Promise.all([
      this.prisma.branchExpense.findMany({ where, select: amountSelect }),
      this.prisma.branchVale.findMany({ where, select: amountSelect }),
      this.prisma.branchCashDay.findMany({ where: { branchId: { in: branchIds }, date: { gte, lte } } }),
      // One call per branch; there are only a handful.
      Promise.all(branches.map((b) => this.sales.getDailySummary(b.id, q.from, q.to))),
    ]);

    type Acc = { branchId: number; date: string; sales: number; expenses: number[]; vale: number[]; cashDay: BranchCashDay | null };
    const byKey = new Map<string, Acc>();
    const at = (branchId: number, date: string): Acc => {
      const key = `${branchId}|${date}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { branchId, date, sales: 0, expenses: [], vale: [], cashDay: null };
        byKey.set(key, acc);
      }
      return acc;
    };
    for (const s of salesByBranch) for (const d of s.dailySummary) at(s.branchId, d.date).sales = d.totalSales;
    for (const e of expenses) at(e.branchId, day(e.date)).expenses.push(num(e.amount));
    for (const v of vale) at(v.branchId, day(v.date)).vale.push(num(v.amount));
    for (const c of cashDays) at(c.branchId, day(c.date)).cashDay = c;

    const names = new Map(branches.map((b) => [b.id, b.name]));
    let rows: CashSummaryRow[] = [...byKey.values()].map((a) => ({
      branchId: a.branchId,
      branchName: names.get(a.branchId) ?? '',
      date: a.date,
      status: a.cashDay?.status ?? 'OPEN',
      totals: computeCashDay({
        sales: a.sales,
        expenseAmounts: a.expenses,
        valeAmounts: a.vale,
        actualCash: amountOrNull(a.cashDay?.actualCash),
        snapshot: snapshotOf(a.cashDay),
      }),
    }));
    if (q.unverified) rows = rows.filter((r) => r.status !== 'VERIFIED');
    rows.sort((x, y) => y.date.localeCompare(x.date) || x.branchName.localeCompare(y.branchName));

    const add = (pick: (t: CashDayTotals) => number | null) =>
      pesos(rows.reduce((s, r) => s + centavos(pick(r.totals) ?? 0), 0));
    return {
      rows,
      totals: {
        sales: add((t) => t.sales),
        expenses: add((t) => t.expenses),
        vale: add((t) => t.vale),
        expected: add((t) => t.expected),
        actualCash: add((t) => t.actualCash),
        overShort: add((t) => t.overShort),
        days: rows.length,
        unverifiedDays: rows.filter((r) => r.status !== 'VERIFIED').length,
        notCountedDays: rows.filter((r) => r.totals.state === 'NOT_COUNTED').length,
      },
    };
  }

  verify(branchId: number, date: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await lockCashDay(tx, branchId, date);
      const before = await tx.branchCashDay.findUnique({ where: { branchId_date: { branchId, date: toUtcDay(date) } } });
      if (before?.status === 'VERIFIED') throw new ConflictException('This day is already verified.');
      if (!before || before.actualCash == null) {
        throw new BadRequestException('Enter the counted cash before verifying.');
      }
      const [sales, lines] = await Promise.all([this.salesOn(branchId, date), this.lines(tx, branchId, date)]);
      const totals = computeCashDay({
        sales,
        expenseAmounts: lines.expenses.map((e) => num(e.amount)),
        valeAmounts: lines.vale.map((v) => num(v.amount)),
        actualCash: num(before.actualCash),
        snapshot: null,
      });
      const after = await tx.branchCashDay.update({
        where: { id: before.id },
        data: {
          status: 'VERIFIED',
          verifiedById: userId,
          verifiedAt: new Date(),
          salesAtVerify: totals.sales,
          expensesAtVerify: totals.expenses,
          valeAtVerify: totals.vale,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchCashDay', entityId: after.id, before, after }], userId);
      return after;
    });
  }

  reopen(branchId: number, date: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await lockCashDay(tx, branchId, date);
      const before = await tx.branchCashDay.findUnique({ where: { branchId_date: { branchId, date: toUtcDay(date) } } });
      if (before?.status !== 'VERIFIED') throw new ConflictException('This day is not verified.');
      const after = await tx.branchCashDay.update({
        where: { id: before.id },
        data: {
          status: 'OPEN',
          verifiedById: null,
          verifiedAt: null,
          salesAtVerify: null,
          expensesAtVerify: null,
          valeAtVerify: null,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchCashDay', entityId: after.id, before, after }], userId);
      return after;
    });
  }

  /** People who can take a vale that day — the payroll rule — branch's own first. */
  async employeesFor(branchId: number, date: string): Promise<ValeEmployeeOption[]> {
    const d = toUtcDay(date);
    const rows = await this.prisma.employee.findMany({
      where: { deletedAt: null, hiredOn: { lte: d }, OR: [{ separatedOn: null }, { separatedOn: { gte: d } }] },
      select: { id: true, firstName: true, lastName: true, branchId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const own = (r: { branchId: number | null }) => (r.branchId === branchId ? 0 : 1);
    return [...rows]
      .sort((a, b) => own(a) - own(b))
      .map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, branchId: r.branchId }));
  }

  private async salesOn(branchId: number, date: string): Promise<number> {
    const result = await this.sales.getByBranchAndDate(branchId, date);
    return result.totals.totalSales;
  }

  private async lines(db: Db, branchId: number, date: string) {
    const where = { branchId, date: toUtcDay(date), deletedAt: null };
    const [expenses, vale] = await Promise.all([
      db.branchExpense.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { id: 'asc' },
      }),
      db.branchVale.findMany({
        where,
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { expenses, vale };
  }
}
```

The query orders by name; the stable sort then only moves the branch's own people to the front.

- [ ] **Step 4: Run the tests**

Run: `npx jest src/server/branch-cash/branch-cash-days.service.spec.ts src/server/sales`
Expected: PASS (existing sales suites unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/server/sales/sales.module.ts src/server/branch-cash/branch-cash-days.service.ts src/server/branch-cash/branch-cash-days.service.spec.ts
git commit -m "feat(branch-cash): day view, period summary, verify and reopen" -m "<trailer>"
```

---

### Task 8: Controller, module and authorization

**Files:**
- Create: `src/server/branch-cash/branch-cash.controller.ts`
- Create: `src/server/branch-cash/branch-cash.module.ts`
- Modify: `src/server/app.module.ts`
- Modify: `src/server/common/guards/rbac-matrix.spec.ts`
- Test: `src/server/branch-cash/branch-cash.http.spec.ts`

**Interfaces:**
- Consumes: the three services (Tasks 5–7); DTOs (Task 4); `BranchGuard`, `RolesGuard`, `FeatureGuard`; `@Roles`, `@RequireFeature`, `@CurrentUser`, `@Idempotent`.
- Produces: `BranchCashController` at `/branch-cash` with handlers `getDay`, `summary`, `employees`, `listCategories`, `createCategory`, `updateCategory`, `createExpense`, `updateExpense`, `voidExpense`, `createVale`, `updateVale`, `voidVale`, `setActualCash`, `verify`, `reopen`. `BranchCashModule` (imports `SalesModule`).

- [ ] **Step 1: Write the controller**

`src/server/branch-cash/branch-cash.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { BranchGuard } from '../common/guards/branch.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { CurrentUser } from '../common/decorators/user.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { BranchCashDaysService } from './branch-cash-days.service';
import { BranchCashEntriesService } from './branch-cash-entries.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import {
  CashDayRefDto,
  CreateCategoryDto,
  CreateExpenseDto,
  CreateValeDto,
  DayQueryDto,
  SetActualCashDto,
  SummaryQueryDto,
  UpdateCategoryDto,
  UpdateExpenseDto,
  UpdateValeDto,
} from './dto/branch-cash.dto';

type Actor = { id: number };

/**
 * The scoped branch for an `:id` route. For a branch-confined user BranchGuard
 * has pinned their own branch into the query, so a row from another branch is
 * simply not found (404) — never a 403 that confirms the id exists.
 */
function parseBranchId(raw?: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

@Controller('branch-cash')
@UseGuards(BranchGuard)
@RequireFeature('branch-cash')
@ApiTags('branch-cash')
@ApiBearerAuth()
export class BranchCashController {
  constructor(
    private readonly days: BranchCashDaysService,
    private readonly entries: BranchCashEntriesService,
    private readonly categories: ExpenseCategoriesService,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  @Get('day')
  getDay(@Query() q: DayQueryDto) {
    return this.days.getDay(q.branchId, q.date);
  }

  @Get('summary')
  summary(@Query() q: SummaryQueryDto) {
    return this.days.summary({ from: q.from, to: q.to, branchId: q.branchId, unverified: q.unverified === 'true' });
  }

  @Get('employees')
  employees(@Query() q: DayQueryDto) {
    return this.days.employeesFor(q.branchId, q.date);
  }

  @Get('categories')
  listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.categories.list(includeInactive === 'true');
  }

  // ── Categories (admin) ─────────────────────────────────────────────────────

  @Post('categories')
  @RequireFeature('branch-cash:categories')
  @Roles(UserRole.ADMIN)
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: Actor) {
    return this.categories.create(dto, user.id);
  }

  @Patch('categories/:id')
  @RequireFeature('branch-cash:categories')
  @Roles(UserRole.ADMIN)
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto, @CurrentUser() user: Actor) {
    return this.categories.update(id, dto, user.id);
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  @Post('expenses')
  @Idempotent()
  @RequireFeature('branch-cash:create')
  @Roles(UserRole.MANAGER)
  createExpense(@Body() dto: CreateExpenseDto, @CurrentUser() user: Actor) {
    return this.entries.createExpense(dto, user.id);
  }

  @Patch('expenses/:id')
  @RequireFeature('branch-cash:edit')
  @Roles(UserRole.MANAGER)
  updateExpense(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: Actor,
    @Query('branchId') branchId?: string,
  ) {
    return this.entries.updateExpense(id, dto, parseBranchId(branchId), user.id);
  }

  @Delete('expenses/:id')
  @RequireFeature('branch-cash:delete')
  @Roles(UserRole.MANAGER)
  voidExpense(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor, @Query('branchId') branchId?: string) {
    return this.entries.voidExpense(id, parseBranchId(branchId), user.id);
  }

  // ── Vale ───────────────────────────────────────────────────────────────────

  @Post('vale')
  @Idempotent()
  @RequireFeature('branch-cash:create')
  @Roles(UserRole.MANAGER)
  createVale(@Body() dto: CreateValeDto, @CurrentUser() user: Actor) {
    return this.entries.createVale(dto, user.id);
  }

  @Patch('vale/:id')
  @RequireFeature('branch-cash:edit')
  @Roles(UserRole.MANAGER)
  updateVale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateValeDto,
    @CurrentUser() user: Actor,
    @Query('branchId') branchId?: string,
  ) {
    return this.entries.updateVale(id, dto, parseBranchId(branchId), user.id);
  }

  @Delete('vale/:id')
  @RequireFeature('branch-cash:delete')
  @Roles(UserRole.MANAGER)
  voidVale(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Actor, @Query('branchId') branchId?: string) {
    return this.entries.voidVale(id, parseBranchId(branchId), user.id);
  }

  // ── The day ────────────────────────────────────────────────────────────────

  @Put('day/actual-cash')
  @RequireFeature('branch-cash:create')
  @Roles(UserRole.MANAGER)
  setActualCash(@Body() dto: SetActualCashDto, @CurrentUser() user: Actor) {
    return this.entries.setActualCash(dto, user.id);
  }

  @Post('day/verify')
  @RequireFeature('branch-cash:verify')
  @Roles(UserRole.ADMIN)
  verify(@Body() dto: CashDayRefDto, @CurrentUser() user: Actor) {
    return this.days.verify(dto.branchId, dto.date, user.id);
  }

  @Post('day/reopen')
  @RequireFeature('branch-cash:verify')
  @Roles(UserRole.ADMIN)
  reopen(@Body() dto: CashDayRefDto, @CurrentUser() user: Actor) {
    return this.days.reopen(dto.branchId, dto.date, user.id);
  }
}
```

`src/server/branch-cash/branch-cash.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SalesModule } from '../sales/sales.module';
import { BranchCashController } from './branch-cash.controller';
import { BranchCashDaysService } from './branch-cash-days.service';
import { BranchCashEntriesService } from './branch-cash-entries.service';
import { ExpenseCategoriesService } from './expense-categories.service';

@Module({
  imports: [SalesModule],
  controllers: [BranchCashController],
  providers: [BranchCashDaysService, BranchCashEntriesService, ExpenseCategoriesService],
})
export class BranchCashModule {}
```

In `src/server/app.module.ts`, import `BranchCashModule` from `./branch-cash/branch-cash.module` and add it to `imports` after `PayrollModule`.

- [ ] **Step 2: Write the HTTP test**

`src/server/branch-cash/branch-cash.http.spec.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ROLE_DEFAULTS, type RoleName } from '@/lib/rbac/features';
import { RolesGuard } from '../common/guards/roles.guard';
import { FeatureGuard } from '../common/guards/feature.guard';
import { IDEMPOTENT_KEY } from '../common/decorators/idempotent.decorator';
import { BranchCashController } from './branch-cash.controller';
import { BranchCashDaysService } from './branch-cash-days.service';
import { BranchCashEntriesService } from './branch-cash-entries.service';
import { ExpenseCategoriesService } from './expense-categories.service';

/**
 * Branch cash through a real Nest + Express 5 stack: the real global guards,
 * the real BranchGuard, and the app's ValidationPipe options. Scope and the
 * body stamping only show up at this level.
 */
async function bootAs(role: RoleName, branchId: number | null) {
  const days = {
    getDay: jest.fn().mockResolvedValue({}),
    summary: jest.fn().mockResolvedValue({ rows: [] }),
    verify: jest.fn().mockResolvedValue({}),
  };
  const entries = {
    createExpense: jest.fn().mockResolvedValue({ id: 11 }),
    updateExpense: jest.fn().mockResolvedValue({ id: 11 }),
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [BranchCashController],
    providers: [
      { provide: BranchCashDaysService, useValue: days },
      { provide: BranchCashEntriesService, useValue: entries },
      { provide: ExpenseCategoriesService, useValue: {} },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: FeatureGuard },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = { id: 1, role, branchId, permissions: [...ROLE_DEFAULTS[role]] };
    next();
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return { app, days, entries };
}

describe('branch cash over HTTP', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('confines a manager to their own branch-day', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer()).get('/branch-cash/day?date=2026-10-01').expect(200);
    expect(booted.days.getDay).toHaveBeenCalledWith(3, '2026-10-01');
    await request(app.getHttpServer()).get('/branch-cash/day?branchId=5&date=2026-10-01').expect(403);
  });

  it('scopes a manager’s summary to their branch', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer()).get('/branch-cash/summary?from=2026-10-01&to=2026-10-07').expect(200);
    expect(booted.days.summary).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-07', branchId: 3, unverified: false });
  });

  it('stamps the manager’s branch on a new expense', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer())
      .post('/branch-cash/expenses')
      .send({ date: '2026-10-01', categoryId: 2, amount: 850 })
      .expect(201);
    expect(booted.entries.createExpense.mock.calls[0][0]).toMatchObject({ branchId: 3, amount: 850 });
  });

  it('lets a manager edit despite the stamped branchId, scoped by the query', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer()).patch('/branch-cash/expenses/11').send({ amount: 900 }).expect(200);
    expect(booted.entries.updateExpense).toHaveBeenCalledWith(11, expect.objectContaining({ amount: 900 }), 3, 1);
  });

  it('rejects an amount with more than two decimals', async () => {
    const booted = await bootAs('MANAGER', 3);
    app = booted.app;
    await request(app.getHttpServer())
      .post('/branch-cash/expenses')
      .send({ date: '2026-10-01', categoryId: 2, amount: 12.345 })
      .expect(400);
    expect(booted.entries.createExpense).not.toHaveBeenCalled();
  });

  it('refuses verification to a manager and serves it to an admin', async () => {
    const manager = await bootAs('MANAGER', 3);
    app = manager.app;
    await request(app.getHttpServer()).post('/branch-cash/day/verify').send({ date: '2026-10-01' }).expect(403);
    await app.close();

    const admin = await bootAs('ADMIN', null);
    app = admin.app;
    await request(app.getHttpServer())
      .post('/branch-cash/day/verify')
      .send({ branchId: 3, date: '2026-10-01' })
      .expect(201);
    expect(admin.days.verify).toHaveBeenCalledWith(3, '2026-10-01', 1);
  });

  it('refuses a viewer before loading anything', async () => {
    const booted = await bootAs('VIEWER', null);
    app = booted.app;
    await request(app.getHttpServer()).get('/branch-cash/summary?from=2026-10-01&to=2026-10-07').expect(403);
    expect(booted.days.summary).not.toHaveBeenCalled();
  });

  it('marks the adding endpoints idempotent', () => {
    const reflector = new Reflector();
    const proto = BranchCashController.prototype;
    expect(reflector.get(IDEMPOTENT_KEY, proto.createExpense)).toBe(true);
    expect(reflector.get(IDEMPOTENT_KEY, proto.createVale)).toBe(true);
  });
});
```

- [ ] **Step 3: Add the matrix rows**

In `src/server/common/guards/rbac-matrix.spec.ts`, add the import:

```ts
import { BranchCashController } from '../../branch-cash/branch-cash.controller';
```

Add to `MATRIX` (roles are VIEWER, INVENTORY, MANAGER, ADMIN):

```ts
  // ── Branch cash: managers record their drawer, admins verify ──────────────
  ['cash day',             { controller: BranchCashController, method: 'getDay' },        [D, D, A, A]],
  ['cash summary',         { controller: BranchCashController, method: 'summary' },       [D, D, A, A]],
  ['add expense',          { controller: BranchCashController, method: 'createExpense' }, [D, D, A, A]],
  ['void vale',            { controller: BranchCashController, method: 'voidVale' },      [D, D, A, A]],
  ['set counted cash',     { controller: BranchCashController, method: 'setActualCash' }, [D, D, A, A]],
  ['verify cash day',      { controller: BranchCashController, method: 'verify' },        [D, D, D, A]],
  ['add expense category', { controller: BranchCashController, method: 'createCategory' },[D, D, D, A]],
```

Add `BranchCashController` to the `CONTROLLERS` array in `describe('action minRole mirrors the decorators', …)`.

- [ ] **Step 4: Run the authorization suites**

Run: `npx jest src/server/branch-cash src/server/common/guards`
Expected: PASS. If a matrix row fails, the controller decorators are wrong: fix the controller, not the row. If "action minRole mirrors the decorators" fails, the `minRole` in `features.ts` (Task 2) and the `@Roles` here disagree — `create`/`edit`/`delete` are MANAGER, `verify`/`categories` ADMIN.

- [ ] **Step 5: Type-check the server**

Run: `npx tsc --noEmit -p tsconfig.server.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/branch-cash/branch-cash.controller.ts src/server/branch-cash/branch-cash.module.ts src/server/branch-cash/branch-cash.http.spec.ts src/server/app.module.ts src/server/common/guards/rbac-matrix.spec.ts
git commit -m "feat(branch-cash): controller, branch scoping and authorization tests" -m "<trailer>"
```

---

### Task 9: Payroll deducts vale

**Files:**
- Modify: `src/server/payroll/compute-payslip.ts`
- Modify: `src/server/payroll/compute-payslip.spec.ts`
- Modify: `src/server/payroll/payroll-draft.service.ts`
- Modify: `src/server/payroll/payroll-draft.service.spec.ts`
- Create: `src/server/employees/vale-window.util.ts`
- Test: `src/server/employees/vale-window.util.spec.ts`
- Modify: `src/server/employees/employees.service.ts`

**Interfaces:**
- Consumes: `BranchVale` (Task 1); payroll's `computePayslip`, `PayrollDraftService.build`, `EmployeesService.update` / `setSeparation`.
- Produces:
  - `ValeInput { id: number; date: string; branchName: string; amount: number }`; `PayslipInput.vale: ValeInput[]`; `LineSource` gains `'BranchVale'`.
  - `assertValeWithinEmployment(tx, employeeId: number, hiredOn: string, separatedOn: string | null): Promise<void>` — `ConflictException` when a live vale falls outside the window.

- [ ] **Step 1: Write the failing computation test**

In `src/server/payroll/compute-payslip.spec.ts`, add `vale: [],` to the object returned by the `input()` helper (next to `adjustments: [],`), then add:

```ts
  it('deducts each vale in the cutoff as its own line', () => {
    const slip = computePayslip(
      input({
        vale: [
          { id: 21, date: '2026-09-03', branchName: 'Main', amount: 500 },
          { id: 22, date: '2026-09-10', branchName: 'Cubao', amount: 250.5 },
        ],
      }),
    );
    expect(slip).toMatchObject({ totalDeductions: 750.5, netPay: 7049.5 });
    expect(slip.lines.filter((l) => l.sourceType === 'BranchVale')).toEqual([
      { type: 'DEDUCTION', label: 'Vale — Main, Sep 3', quantity: null, rate: null, amount: 500, sourceType: 'BranchVale', sourceId: 21 },
      { type: 'DEDUCTION', label: 'Vale — Cubao, Sep 10', quantity: null, rate: null, amount: 250.5, sourceType: 'BranchVale', sourceId: 22 },
    ]);
  });
```

(The fixture's basic pay is 13 days × ₱600 = ₱7,800, so net = 7,800 − 750.50.)

Run: `npx jest src/server/payroll/compute-payslip.spec.ts`
Expected: FAIL — `vale` is not a property of `PayslipInput`.

- [ ] **Step 2: Add vale to the computation**

In `src/server/payroll/compute-payslip.ts`:

Change `LineSource`:

```ts
export type LineSource = 'EmployeeRate' | 'PayrollAdjustment' | 'RecurringDeduction' | 'BranchVale';
```

Add below `AdjustmentInput`:

```ts
/** A cash advance taken from a branch drawer (BranchVale), dated inside the cutoff. */
export interface ValeInput { id: number; date: string; branchName: string; amount: number }
```

Add `vale: ValeInput[];` to `PayslipInput` after `adjustments`.

Add near the other helpers:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-09-03` → `Sep 3`. String arithmetic: no Date, no time zone. */
function shortDate(date: string): string {
  const [, month, dayOfMonth] = date.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(dayOfMonth)}`;
}
```

In `computePayslip`, directly after the loop over `DEDUCTION` adjustments and before `lines.push(...employerLines);`:

```ts
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
```

Run: `npx jest src/server/payroll/compute-payslip.spec.ts`
Expected: PASS (all existing tests plus the new one).

- [ ] **Step 3: Write the failing draft test**

In `src/server/payroll/payroll-draft.service.spec.ts`, add `vale: [],` to the `employee()` fixture, then add to the first test (`loads everyone employed during the cutoff…`):

```ts
    expect(include.vale).toEqual({
      where: { deletedAt: null, date: { gte: at('2026-09-01'), lte: at('2026-09-15') } },
      include: { branch: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
```

and a new test:

```ts
  it('deducts the employee’s vale for the cutoff', async () => {
    prisma.employee.findMany.mockResolvedValue([
      employee({ vale: [{ id: 21, date: at('2026-09-03'), amount: 500, branch: { name: 'Main' } }] }),
    ]);
    const draft = await service.build('2026-09-01');
    expect(draft.payslips[0].lines).toContainEqual(
      expect.objectContaining({ label: 'Vale — Main, Sep 3', amount: 500, sourceType: 'BranchVale', sourceId: 21 }),
    );
  });
```

Run: `npx jest src/server/payroll/payroll-draft.service.spec.ts`
Expected: FAIL — `include.vale` is undefined.

- [ ] **Step 4: Load vale in the draft**

In `src/server/payroll/payroll-draft.service.ts`, in `build`, add to the `include` of `db.employee.findMany` after `skips`:

```ts
        vale: {
          where: { deletedAt: null, date: { gte: start, lte: end } },
          include: { branch: { select: { name: true } } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        },
```

and to the `computePayslip({ … })` argument after `skippedRecurringIds`:

```ts
        vale: e.vale.map((v) => ({ id: v.id, date: day(v.date), branchName: v.branch.name, amount: num(v.amount) })),
```

Finalize builds from the same draft, so its `PayslipLine` rows carry the vale lines with `sourceType: 'BranchVale'` without further change. Update the comment on `PayslipLine.sourceType` in `prisma/schema.prisma` to `// EmployeeRate | PayrollAdjustment | RecurringDeduction | BranchVale` (comment only; no migration).

Run: `npx jest src/server/payroll`
Expected: PASS.

- [ ] **Step 5: Write the failing employment-window test**

`src/server/employees/vale-window.util.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { assertValeWithinEmployment } from './vale-window.util';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function fakeTx(found: { date: Date } | null) {
  return { branchVale: { findFirst: jest.fn().mockResolvedValue(found) } };
}

describe('assertValeWithinEmployment', () => {
  it('passes when every vale is inside the new window', async () => {
    const tx = fakeTx(null);
    await expect(assertValeWithinEmployment(tx as never, 5, '2026-01-05', '2026-09-30')).resolves.toBeUndefined();
    expect(tx.branchVale.findFirst).toHaveBeenCalledWith({
      where: {
        employeeId: 5,
        deletedAt: null,
        OR: [{ date: { lt: at('2026-01-05') } }, { date: { gt: at('2026-09-30') } }],
      },
      select: { date: true },
      orderBy: { date: 'asc' },
    });
  });

  it('does not bound the end while the employee is still employed', async () => {
    const tx = fakeTx(null);
    await assertValeWithinEmployment(tx as never, 5, '2026-01-05', null);
    expect(tx.branchVale.findFirst.mock.calls[0][0].where.OR).toEqual([{ date: { lt: at('2026-01-05') } }]);
  });

  it('refuses a change that would strand a vale outside employment', async () => {
    const tx = fakeTx({ date: at('2026-10-02') });
    await expect(assertValeWithinEmployment(tx as never, 5, '2026-01-05', '2026-09-30')).rejects.toThrow(
      new ConflictException(
        'This employee has a vale dated 2026-10-02, outside the new employment dates. Void or reassign it first.',
      ),
    );
  });
});
```

Run: `npx jest src/server/employees/vale-window.util.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement and wire it into the employee service**

`src/server/employees/vale-window.util.ts`:

```ts
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toUtcDay } from '../common/utils/date-range.util';
import { day } from '../payroll/payroll-lock.util';

/**
 * Payroll deducts a vale only while its date falls inside the employee's
 * employment. Moving hiredOn later or separatedOn earlier than a vale would
 * silently drop that vale from every payslip, so the change is refused.
 */
export async function assertValeWithinEmployment(
  tx: Prisma.TransactionClient,
  employeeId: number,
  hiredOn: string,
  separatedOn: string | null,
): Promise<void> {
  const outside: Prisma.BranchValeWhereInput[] = [{ date: { lt: toUtcDay(hiredOn) } }];
  if (separatedOn) outside.push({ date: { gt: toUtcDay(separatedOn) } });
  const stranded = await tx.branchVale.findFirst({
    where: { employeeId, deletedAt: null, OR: outside },
    select: { date: true },
    orderBy: { date: 'asc' },
  });
  if (stranded) {
    throw new ConflictException(
      `This employee has a vale dated ${day(stranded.date)}, outside the new employment dates. Void or reassign it first.`,
    );
  }
}
```

In `src/server/employees/employees.service.ts`:
- In `update(id, dto, userId)`, inside its transaction, when `dto.hiredOn` is present and differs from the stored value, call `await assertValeWithinEmployment(tx, id, dto.hiredOn, <stored separatedOn as YYYY-MM-DD or null>)` before the write.
- In `setSeparation(id, separatedOn, userId)`, inside its transaction and before the write, call `await assertValeWithinEmployment(tx, id, <stored hiredOn as YYYY-MM-DD>, separatedOn)`.

Use `day(row.hiredOn)` / `row.separatedOn ? day(row.separatedOn) : null` for the stored values. If either method does not already run in a `$transaction`, wrap its read-check-write in one.

Add one test to `src/server/employees/employees.service.spec.ts` in that file's existing mock style: `setSeparation` with a mocked `branchVale.findFirst` returning `{ date: new Date('2026-10-02T00:00:00.000Z') }` rejects with `ConflictException` and does not call `employee.update`.

- [ ] **Step 7: Run the suites**

Run: `npx jest src/server/employees src/server/payroll`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/server/payroll src/server/employees prisma/schema.prisma
git commit -m "feat(payroll): deduct branch vale on payslips; refuse employment dates that strand a vale" -m "<trailer>"
```

---

### Task 10: Frontend types, API wrappers and the cash panel

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/apiServices.ts`
- Create: `src/components/branch-cash/parseAmount.ts`
- Create: `src/components/branch-cash/CashLineForm.tsx`
- Create: `src/components/branch-cash/CashReconciliation.tsx`
- Create: `src/components/branch-cash/BranchCashPanel.tsx`
- Test: `src/components/branch-cash/CashLineForm.spec.tsx`
- Test: `src/components/branch-cash/BranchCashPanel.spec.tsx`

**Interfaces:**
- Consumes: the endpoints of Task 8; `peso` from `@/lib/payroll/format`; `useCan`; `useIdempotencyKey`, `idempotencyHeader`; `extractError`.
- Produces:
  - Types `CashDayState`, `CashDayTotals`, `CashDayView`, `CashSummaryRow`, `CashSummary`, `ExpenseCategory`, `ValeEmployeeOption` in `@/types`.
  - `branchCashApi` in `@/lib/apiServices`.
  - `BRANCH_CASH_KEY = ['branch-cash'] as const` and default export `BranchCashPanel({ branchId, date }: { branchId: number; date: string })` from `@/components/branch-cash/BranchCashPanel`.
  - `parseAmount(text: string): number | null`.

- [ ] **Step 1: Add the types**

Append to `src/types/index.ts`:

```ts
// ─── Branch cash ─────────────────────────────────────────────────────────────

export type CashDayState = 'NOT_COUNTED' | 'BALANCED' | 'OVER' | 'SHORT';

export interface CashDayTotals {
  sales: number;
  expenses: number;
  vale: number;
  expected: number;
  actualCash: number | null;
  overShort: number | null;
  state: CashDayState;
  drift: { field: 'sales' | 'expenses' | 'vale'; atVerify: number; now: number }[];
}

export interface CashExpenseLine {
  id: number;
  category: { id: number; name: string };
  amount: number;
  note: string | null;
}

export interface CashValeLine {
  id: number;
  employee: { id: number; name: string };
  amount: number;
  note: string | null;
}

export interface CashDayView {
  branchId: number;
  date: string;
  status: 'OPEN' | 'VERIFIED';
  verifiedAt: string | null;
  verifiedBy: string | null;
  note: string | null;
  expenses: CashExpenseLine[];
  vale: CashValeLine[];
  totals: CashDayTotals;
}

export interface CashSummaryRow {
  branchId: number;
  branchName: string;
  date: string;
  status: 'OPEN' | 'VERIFIED';
  totals: CashDayTotals;
}

export interface CashSummary {
  rows: CashSummaryRow[];
  totals: {
    sales: number;
    expenses: number;
    vale: number;
    expected: number;
    actualCash: number;
    overShort: number;
    days: number;
    unverifiedDays: number;
    notCountedDays: number;
  };
}

export interface ExpenseCategory {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
  requiresNote: boolean;
}

export interface ValeEmployeeOption {
  id: number;
  name: string;
  branchId: number | null;
}
```

- [ ] **Step 2: Add the API wrappers**

In `src/lib/apiServices.ts`, add the seven new types to the `import type { … } from '@/types'` list, then append:

```ts
export const branchCashApi = {
  day: (branchId: number, date: string) =>
    api.get<CashDayView>('/branch-cash/day', { params: { branchId, date } }),
  summary: (p: { from: string; to: string; branchId?: number; unverified?: boolean }) =>
    api.get<CashSummary>('/branch-cash/summary', {
      params: { from: p.from, to: p.to, branchId: p.branchId, unverified: p.unverified ? 'true' : undefined },
    }),
  employees: (branchId: number, date: string) =>
    api.get<ValeEmployeeOption[]>('/branch-cash/employees', { params: { branchId, date } }),
  categories: (includeInactive = false) =>
    api.get<ExpenseCategory[]>('/branch-cash/categories', {
      params: includeInactive ? { includeInactive: 'true' } : undefined,
    }),
  createCategory: (data: { name: string; requiresNote?: boolean; sortOrder?: number }) =>
    api.post<ExpenseCategory>('/branch-cash/categories', data),
  updateCategory: (
    id: number,
    data: { name?: string; requiresNote?: boolean; sortOrder?: number; isActive?: boolean },
  ) => api.patch<ExpenseCategory>(`/branch-cash/categories/${id}`, data),
  createExpense: (
    data: { branchId: number; date: string; categoryId: number; amount: number; note?: string },
    idempotencyKey?: string,
  ) => api.post('/branch-cash/expenses', data, idempotencyHeader(idempotencyKey)),
  updateExpense: (id: number, data: { categoryId?: number; amount?: number; note?: string | null }) =>
    api.patch(`/branch-cash/expenses/${id}`, data),
  voidExpense: (id: number) => api.delete(`/branch-cash/expenses/${id}`),
  createVale: (
    data: { branchId: number; date: string; employeeId: number; amount: number; note?: string },
    idempotencyKey?: string,
  ) => api.post('/branch-cash/vale', data, idempotencyHeader(idempotencyKey)),
  updateVale: (id: number, data: { employeeId?: number; amount?: number; note?: string | null }) =>
    api.patch(`/branch-cash/vale/${id}`, data),
  voidVale: (id: number) => api.delete(`/branch-cash/vale/${id}`),
  setActualCash: (data: { branchId: number; date: string; actualCash: number | null }) =>
    api.put('/branch-cash/day/actual-cash', data),
  verify: (branchId: number, date: string) => api.post('/branch-cash/day/verify', { branchId, date }),
  reopen: (branchId: number, date: string) => api.post('/branch-cash/day/reopen', { branchId, date }),
};
```

- [ ] **Step 3: Write the failing form tests**

`src/components/branch-cash/CashLineForm.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseAmount } from './parseAmount';
import CashLineForm from './CashLineForm';

describe('parseAmount', () => {
  it.each([
    ['1,250.50', 1250.5],
    [' 850 ', 850],
    ['₱1,000', 1000],
    ['0.05', 0.05],
  ])('reads %p as %p', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });

  it.each(['', 'abc', '12.345', '-5', '0'])('rejects %p', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('CashLineForm', () => {
  const options = [
    { value: '2', label: 'Utilities' },
    { value: '5', label: 'Other', requiresNote: true },
  ];

  it('submits the picked option, the parsed amount and the note', async () => {
    const onSubmit = vi.fn();
    render(<CashLineForm pickLabel="Category" options={options} onSubmit={onSubmit} submitLabel="Add" />);
    await userEvent.selectOptions(screen.getByLabelText('Category'), '2');
    await userEvent.type(screen.getByLabelText('Amount'), '1,250.50');
    await userEvent.type(screen.getByLabelText('Note'), 'LPG');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledWith({ optionId: 2, amount: 1250.5, note: 'LPG' });
  });

  it('holds the button while a note is required but empty', async () => {
    const onSubmit = vi.fn();
    render(<CashLineForm pickLabel="Category" options={options} onSubmit={onSubmit} submitLabel="Add" />);
    await userEvent.selectOptions(screen.getByLabelText('Category'), '5');
    await userEvent.type(screen.getByLabelText('Amount'), '60');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('disables the button while a save is pending', () => {
    render(<CashLineForm pickLabel="Category" options={options} onSubmit={vi.fn()} submitLabel="Add" pending />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
```

Run: `npx vitest run src/components/branch-cash/CashLineForm.spec.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `parseAmount` and `CashLineForm`**

`src/components/branch-cash/parseAmount.ts`:

```ts
/**
 * A peso amount as typed on a phone: "1,250.50", "₱850", " 60 ".
 * Returns null for anything that is not a positive amount with at most two
 * decimals — the same rule the API enforces.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return value > 0 ? value : null;
}
```

`src/components/branch-cash/CashLineForm.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseAmount } from './parseAmount';

export type CashLineOption = { value: string; label: string; requiresNote?: boolean };
export type CashLineValues = { optionId: number; amount: number; note: string };

/**
 * One line of the drawer section: pick (category or employee), amount, note.
 * Used for adding and for editing. A native select keeps it fast on phones and
 * testable; the lists are short.
 */
export default function CashLineForm({
  pickLabel,
  options,
  onSubmit,
  onCancel,
  submitLabel,
  pending = false,
  initial,
}: {
  pickLabel: string;
  options: CashLineOption[];
  onSubmit: (values: CashLineValues) => void;
  onCancel?: () => void;
  submitLabel: string;
  pending?: boolean;
  initial?: { optionId: number; amount: number; note: string | null };
}) {
  const id = useId();
  const [optionId, setOptionId] = useState(initial ? String(initial.optionId) : '');
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '');
  const [note, setNote] = useState(initial?.note ?? '');

  const amount = parseAmount(amountText);
  const option = options.find((o) => o.value === optionId);
  const noteMissing = option?.requiresNote === true && note.trim() === '';
  const ready = option != null && amount != null && !noteMissing && !pending;

  const submit = () => {
    if (!ready) return;
    onSubmit({ optionId: Number(optionId), amount: amount!, note: note.trim() });
  };

  return (
    <form
      className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="col-span-2 sm:col-span-1">
        <label htmlFor={`${id}-pick`} className="text-xs text-muted-foreground">{pickLabel}</label>
        <select
          id={`${id}-pick`}
          value={optionId}
          onChange={(e) => setOptionId(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-amount`} className="text-xs text-muted-foreground">Amount</label>
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          aria-invalid={amountText !== '' && amount == null}
        />
      </div>
      <div>
        <label htmlFor={`${id}-note`} className="text-xs text-muted-foreground">Note</label>
        <Input
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder={option?.requiresNote ? 'Required' : 'Optional'}
        />
      </div>
      <div className="col-span-2 flex gap-2 sm:col-span-1">
        <Button type="submit" size="sm" disabled={!ready}>
          {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        ) : null}
      </div>
    </form>
  );
}
```

Run: `npx vitest run src/components/branch-cash/CashLineForm.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing panel tests**

`src/components/branch-cash/BranchCashPanel.spec.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';
import { peso } from '@/lib/payroll/format';
import type { CashDayView } from '@/types';

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = {
  day: vi.fn(),
  categories: vi.fn().mockResolvedValue({ data: [{ id: 2, name: 'Utilities', requiresNote: false, isActive: true, sortOrder: 10 }] }),
  employees: vi.fn().mockResolvedValue({ data: [{ id: 5, name: 'Ana Cruz', branchId: 3 }] }),
  createExpense: vi.fn().mockResolvedValue({ data: {} }),
  createVale: vi.fn().mockResolvedValue({ data: {} }),
  voidExpense: vi.fn().mockResolvedValue({ data: {} }),
  setActualCash: vi.fn().mockResolvedValue({ data: {} }),
  verify: vi.fn().mockResolvedValue({ data: {} }),
  reopen: vi.fn().mockResolvedValue({ data: {} }),
};
vi.mock('@/lib/apiServices', () => ({ branchCashApi: api }));

const { default: BranchCashPanel } = await import('./BranchCashPanel');

function view(over: Partial<CashDayView> = {}): CashDayView {
  return {
    branchId: 3,
    date: '2026-10-01',
    status: 'OPEN',
    verifiedAt: null,
    verifiedBy: null,
    note: null,
    expenses: [{ id: 11, category: { id: 2, name: 'Utilities' }, amount: 850, note: 'LPG' }],
    vale: [{ id: 21, employee: { id: 5, name: 'Ana Cruz' }, amount: 500, note: null }],
    totals: {
      sales: 12450,
      expenses: 850,
      vale: 500,
      expected: 11100,
      actualCash: 11050,
      overShort: -50,
      state: 'SHORT',
      drift: [],
    },
    ...over,
  };
}

const MANAGER = ['branch-cash', 'branch-cash:create', 'branch-cash:edit', 'branch-cash:delete'];

describe('BranchCashPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = MANAGER;
    api.day.mockResolvedValue({ data: view() });
  });

  it('shows the reconciliation and a shortage', async () => {
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    expect(await screen.findByText(peso(11100))).toBeInTheDocument();
    expect(screen.getByText(`Short ${peso(50)}`)).toBeInTheDocument();
    // The note sits in the same line as its category; the name also appears in the vale picker.
    expect(screen.getByText(/LPG/)).toBeInTheDocument();
    expect(screen.getAllByText('Ana Cruz').length).toBeGreaterThan(0);
  });

  it('adds an expense for this branch-day', async () => {
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    const form = await screen.findByTestId('add-expense');
    await within(form).findByRole('option', { name: 'Utilities' }); // categories load after the day
    await userEvent.selectOptions(within(form).getByLabelText('Category'), '2');
    await userEvent.type(within(form).getByLabelText('Amount'), '60');
    await userEvent.click(within(form).getByRole('button', { name: 'Add expense' }));
    await waitFor(() =>
      expect(api.createExpense).toHaveBeenCalledWith(
        { branchId: 3, date: '2026-10-01', categoryId: 2, amount: 60, note: undefined },
        expect.any(String),
      ),
    );
  });

  it('hides the verify button from managers', async () => {
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    await screen.findByText(peso(11100));
    expect(screen.queryByRole('button', { name: 'Verify day' })).toBeNull();
  });

  it('is read-only once verified, and flags sales drift', async () => {
    auth.permissions = [...MANAGER, 'branch-cash:verify'];
    api.day.mockResolvedValue({
      data: view({
        status: 'VERIFIED',
        verifiedBy: 'admin@louella.ph',
        verifiedAt: '2026-10-02T02:00:00.000Z',
        totals: { ...view().totals, drift: [{ field: 'sales', atVerify: 12450, now: 12510 }] },
      }),
    });
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    expect(await screen.findByText(/Verified by admin@louella.ph/)).toBeInTheDocument();
    expect(screen.queryByTestId('add-expense')).toBeNull();
    expect(screen.getByText(`Sales changed since verification: ${peso(12450)} → ${peso(12510)}`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(api.reopen).toHaveBeenCalledWith(3, '2026-10-01'));
  });

  it('saves the counted cash on blur', async () => {
    api.day.mockResolvedValue({ data: view({ totals: { ...view().totals, actualCash: null, overShort: null, state: 'NOT_COUNTED' } }) });
    renderWithQuery(<BranchCashPanel branchId={3} date="2026-10-01" />);
    const input = await screen.findByLabelText('Counted cash');
    await userEvent.type(input, '11,100');
    await userEvent.tab();
    await waitFor(() =>
      expect(api.setActualCash).toHaveBeenCalledWith({ branchId: 3, date: '2026-10-01', actualCash: 11100 }),
    );
  });
});
```

Run: `npx vitest run src/components/branch-cash/BranchCashPanel.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the reconciliation strip**

`src/components/branch-cash/CashReconciliation.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { peso } from '@/lib/payroll/format';
import type { CashDayView } from '@/types';
import { parseAmount } from './parseAmount';

const BADGE: Record<CashDayView['totals']['state'], { text: (n: number) => string; className: string }> = {
  NOT_COUNTED: { text: () => 'Not counted', className: 'bg-muted text-muted-foreground' },
  BALANCED: { text: () => 'Balanced', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  OVER: { text: (n) => `Over ${peso(Math.abs(n))}`, className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  SHORT: { text: (n) => `Short ${peso(Math.abs(n))}`, className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
};

const FIELD_LABEL = { sales: 'Sales', expenses: 'Expenses', vale: 'Vale' } as const;

/**
 * Sales − Expenses − Vale = Expected, the counted cash, and over/short.
 * The counted cash saves on blur or Enter, only when it changed.
 */
export default function CashReconciliation({
  day,
  canEdit,
  canVerify,
  onSaveCash,
  onVerify,
  onReopen,
  busy,
}: {
  day: CashDayView;
  canEdit: boolean;
  canVerify: boolean;
  onSaveCash: (value: number | null) => void;
  onVerify: () => void;
  onReopen: () => void;
  busy: boolean;
}) {
  const id = useId();
  const { totals } = day;
  const verified = day.status === 'VERIFIED';
  const [cashText, setCashText] = useState(totals.actualCash == null ? '' : String(totals.actualCash));
  // Follow the server's value when it changes (a save, a refetch). Done as a
  // render-time adjustment, as on the inventory page, not in an effect.
  const [syncedCash, setSyncedCash] = useState(totals.actualCash);
  if (syncedCash !== totals.actualCash) {
    setSyncedCash(totals.actualCash);
    setCashText(totals.actualCash == null ? '' : String(totals.actualCash));
  }

  const commitCash = () => {
    const trimmed = cashText.trim();
    const value = trimmed === '' ? null : trimmed === '0' ? 0 : parseAmount(trimmed);
    if (trimmed !== '' && value == null) return; // leave the bad text visible; aria-invalid marks it
    if (value === totals.actualCash) return;
    onSaveCash(value);
  };
  const badge = BADGE[totals.state];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-muted-foreground">Sales</dt>
        <dd className="text-right font-medium sm:text-left">{peso(totals.sales)}</dd>
        <dt className="text-muted-foreground">− Expenses</dt>
        <dd className="text-right sm:text-left">{peso(totals.expenses)}</dd>
        <dt className="text-muted-foreground">− Vale</dt>
        <dd className="text-right sm:text-left">{peso(totals.vale)}</dd>
        <dt className="font-semibold">= Expected cash</dt>
        <dd className="text-right font-semibold sm:text-left">{peso(totals.expected)}</dd>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${id}-cash`} className="text-xs text-muted-foreground">Counted cash</label>
          <Input
            id={`${id}-cash`}
            inputMode="decimal"
            className="w-36"
            value={cashText}
            disabled={!canEdit || verified || busy}
            onChange={(e) => setCashText(e.target.value)}
            onBlur={commitCash}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCash();
            }}
            aria-invalid={cashText.trim() !== '' && cashText.trim() !== '0' && parseAmount(cashText) == null}
          />
        </div>
        <Badge className={badge.className}>{badge.text(totals.overShort ?? 0)}</Badge>
      </div>

      {verified ? (
        <p className="text-xs text-muted-foreground">
          Verified by {day.verifiedBy ?? 'an admin'}
          {day.verifiedAt ? ` on ${dayjs(day.verifiedAt).format('MMM D, h:mm A')}` : ''}
        </p>
      ) : null}
      {totals.drift.map((d) => (
        <p key={d.field} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {FIELD_LABEL[d.field]} changed since verification: {peso(d.atVerify)} → {peso(d.now)}
        </p>
      ))}

      {canVerify ? (
        verified ? (
          <Button size="sm" variant="outline" onClick={onReopen} disabled={busy}>Reopen</Button>
        ) : (
          <Button size="sm" onClick={onVerify} disabled={busy || totals.actualCash == null}>Verify day</Button>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Implement the panel**

`src/components/branch-cash/BranchCashPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { branchCashApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { peso } from '@/lib/payroll/format';
import { useCan } from '@/lib/rbac/useHasFeature';
import { useIdempotencyKey } from '@/lib/useIdempotencyKey';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import CashLineForm, { type CashLineOption } from './CashLineForm';
import CashReconciliation from './CashReconciliation';

/** Every branch-cash query starts with this, so one invalidation refreshes them all. */
export const BRANCH_CASH_KEY = ['branch-cash'] as const;

type Editing = { kind: 'expense' | 'vale'; id: number } | null;

/**
 * The bottom of the paper inventory sheet: the day's expenses, vale and the
 * counted cash, with expected cash and over/short worked out.
 *
 * Each line saves on its own, independent of the inventory sheet's pending-save
 * bar. A verified day is read-only until an admin reopens it.
 */
export default function BranchCashPanel({ branchId, date }: { branchId: number; date: string }) {
  const qc = useQueryClient();
  const canCreate = useCan('branch-cash:create');
  const canEdit = useCan('branch-cash:edit');
  const canVoid = useCan('branch-cash:delete');
  const canVerify = useCan('branch-cash:verify');
  const [expenseKey, renewExpenseKey] = useIdempotencyKey();
  const [valeKey, renewValeKey] = useIdempotencyKey();
  const [editing, setEditing] = useState<Editing>(null);
  const [formVersion, setFormVersion] = useState(0);

  const dayQuery = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'day', branchId, date],
    queryFn: () => branchCashApi.day(branchId, date).then((r) => r.data),
  });
  const { data: categories = [] } = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'categories'],
    queryFn: () => branchCashApi.categories().then((r) => r.data),
  });
  const { data: employees = [] } = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'employees', branchId, date],
    queryFn: () => branchCashApi.employees(branchId, date).then((r) => r.data),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: BRANCH_CASH_KEY });
  const fail = (err: unknown) => {
    toast.error(extractError(err));
    refresh(); // a 409 means the day or cutoff was locked meanwhile: show it
  };
  const done = (message?: string) => {
    if (message) toast.success(message);
    setEditing(null);
    setFormVersion((v) => v + 1); // clears the add rows
    refresh();
  };

  const addExpense = useMutation({
    mutationFn: (v: { optionId: number; amount: number; note: string }) =>
      branchCashApi.createExpense(
        { branchId, date, categoryId: v.optionId, amount: v.amount, note: v.note || undefined },
        expenseKey,
      ),
    onSuccess: () => {
      renewExpenseKey();
      done();
    },
    onError: fail,
  });
  const addVale = useMutation({
    mutationFn: (v: { optionId: number; amount: number; note: string }) =>
      branchCashApi.createVale(
        { branchId, date, employeeId: v.optionId, amount: v.amount, note: v.note || undefined },
        valeKey,
      ),
    onSuccess: () => {
      renewValeKey();
      done();
    },
    onError: fail,
  });
  const editLine = useMutation({
    mutationFn: ({ kind, id, v }: { kind: 'expense' | 'vale'; id: number; v: { optionId: number; amount: number; note: string } }) =>
      kind === 'expense'
        ? branchCashApi.updateExpense(id, { categoryId: v.optionId, amount: v.amount, note: v.note || null })
        : branchCashApi.updateVale(id, { employeeId: v.optionId, amount: v.amount, note: v.note || null }),
    onSuccess: () => done('Saved'),
    onError: fail,
  });
  const voidLine = useMutation({
    mutationFn: ({ kind, id }: { kind: 'expense' | 'vale'; id: number }) =>
      kind === 'expense' ? branchCashApi.voidExpense(id) : branchCashApi.voidVale(id),
    onSuccess: () => done('Voided'),
    onError: fail,
  });
  const saveCash = useMutation({
    mutationFn: (actualCash: number | null) => branchCashApi.setActualCash({ branchId, date, actualCash }),
    onSuccess: () => done(),
    onError: fail,
  });
  const verify = useMutation({
    mutationFn: () => branchCashApi.verify(branchId, date),
    onSuccess: () => done('Day verified'),
    onError: fail,
  });
  const reopen = useMutation({
    mutationFn: () => branchCashApi.reopen(branchId, date),
    onSuccess: () => done('Day reopened'),
    onError: fail,
  });

  if (dayQuery.isLoading) return <Skeleton className="my-4 h-48 w-full rounded-lg" />;
  if (dayQuery.isError || !dayQuery.data) {
    return <p className="my-4 text-sm text-destructive">{extractError(dayQuery.error)}</p>;
  }

  const day = dayQuery.data;
  const open = day.status === 'OPEN';
  const categoryOptions: CashLineOption[] = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
    requiresNote: c.requiresNote,
  }));
  const employeeOptions: CashLineOption[] = employees.map((e) => ({ value: String(e.id), label: e.name }));
  const busy = saveCash.isPending || verify.isPending || reopen.isPending;

  const lineActions = (kind: 'expense' | 'vale', id: number) =>
    open ? (
      <span className="flex gap-1">
        {canEdit ? (
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit" onClick={() => setEditing({ kind, id })}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {canVoid ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Void"
            disabled={voidLine.isPending}
            onClick={() => voidLine.mutate({ kind, id })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </span>
    ) : null;

  return (
    <Card className="my-4 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-bold">Cash</CardTitle>
        <Badge variant={open ? 'outline' : 'default'}>{open ? 'Open' : 'Verified'}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses</h3>
          {day.expenses.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : null}
          {day.expenses.map((e) =>
            editing?.kind === 'expense' && editing.id === e.id ? (
              <CashLineForm
                key={e.id}
                pickLabel="Category"
                options={categoryOptions}
                initial={{ optionId: e.category.id, amount: e.amount, note: e.note }}
                submitLabel="Save"
                pending={editLine.isPending}
                onSubmit={(v) => editLine.mutate({ kind: 'expense', id: e.id, v })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={e.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {e.category.name}
                  {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{peso(e.amount)}</span>
                  {lineActions('expense', e.id)}
                </span>
              </div>
            ),
          )}
          {open && canCreate ? (
            <div data-testid="add-expense">
              <CashLineForm
                key={`expense-${formVersion}`}
                pickLabel="Category"
                options={categoryOptions}
                submitLabel="Add expense"
                pending={addExpense.isPending}
                onSubmit={(v) => addExpense.mutate(v)}
              />
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vale</h3>
          {day.vale.length === 0 ? <p className="text-sm text-muted-foreground">None</p> : null}
          {day.vale.map((v) =>
            editing?.kind === 'vale' && editing.id === v.id ? (
              <CashLineForm
                key={v.id}
                pickLabel="Employee"
                options={employeeOptions}
                initial={{ optionId: v.employee.id, amount: v.amount, note: v.note }}
                submitLabel="Save"
                pending={editLine.isPending}
                onSubmit={(values) => editLine.mutate({ kind: 'vale', id: v.id, v: values })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {v.employee.name}
                  {v.note ? <span className="text-muted-foreground"> · {v.note}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{peso(v.amount)}</span>
                  {lineActions('vale', v.id)}
                </span>
              </div>
            ),
          )}
          {open && canCreate ? (
            <div data-testid="add-vale">
              <CashLineForm
                key={`vale-${formVersion}`}
                pickLabel="Employee"
                options={employeeOptions}
                submitLabel="Add vale"
                pending={addVale.isPending}
                onSubmit={(v) => addVale.mutate(v)}
              />
            </div>
          ) : null}
        </section>

        <Separator />

        <CashReconciliation
          day={day}
          canEdit={canCreate}
          canVerify={canVerify}
          busy={busy}
          onSaveCash={(value) => saveCash.mutate(value)}
          onVerify={() => verify.mutate()}
          onReopen={() => reopen.mutate()}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Run the frontend tests**

Run: `npx vitest run src/components/branch-cash`
Expected: PASS. If `findByText(peso(11100))` matches more than one element (the amount appears in a line and in the strip), change that assertion to `findAllByText(...)` and assert length ≥ 1 — do not change the component.

- [ ] **Step 9: Commit**

```bash
git add src/types/index.ts src/lib/apiServices.ts src/components/branch-cash
git commit -m "feat(branch-cash): cash panel — expenses, vale, counted cash and verification" -m "<trailer>"
```

---

### Task 11: Mount the panel and the Cash Reports page

**Files:**
- Modify: `src/app/(app)/inventory/details/page.tsx`
- Create: `src/app/(app)/branch-cash/page.tsx`
- Create: `src/app/(app)/branch-cash/_components/CategoriesDialog.tsx`
- Test: `src/app/(app)/branch-cash/page.spec.tsx`

**Interfaces:**
- Consumes: `BranchCashPanel`, `BRANCH_CASH_KEY` (Task 10); `branchCashApi`, `branchesApi`; `manilaToday`, `addDays` from `@/lib/manilaDate`; `peso`; `useCan`; `usePageHeader`; shadcn `Sheet`, `Dialog`, `Table`, `Switch`, `Select`, `Input`.
- Produces: the `/branch-cash` route.

- [ ] **Step 1: Mount the panel on the inventory details page**

In `src/app/(app)/inventory/details/page.tsx`:

Add imports:

```tsx
import BranchCashPanel, { BRANCH_CASH_KEY } from '@/components/branch-cash/BranchCashPanel';
```

Next to the other `useCan` calls:

```tsx
  const canSeeCash = useCan('branch-cash');
```

In `savePendingMutation`'s `onSuccess`, after `qc.invalidateQueries({ queryKey: ['inventory-summary'] });`:

```tsx
      // Sales moved, so the cash panel's expected figure did too.
      qc.invalidateQueries({ queryKey: BRANCH_CASH_KEY });
```

Directly after the per-type grids block (the `invQuery.isError ? … : invQuery.isLoading ? … : …` expression) and before the closing wrapper:

```tsx
          {canSeeCash ? (
            !isRange && selectedBranchId != null ? (
              <BranchCashPanel branchId={selectedBranchId} date={filterDateFrom} />
            ) : (
              <p className="my-4 text-sm text-muted-foreground">
                Select one branch and one day to record expenses, vale and cash, or open{' '}
                <Link href="/branch-cash" className="underline">Cash Reports</Link>.
              </p>
            )
          ) : null}
```

Add `import Link from 'next/link';` if the page does not import it already.

- [ ] **Step 2: Write the failing page test**

`src/app/(app)/branch-cash/page.spec.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';
import { peso } from '@/lib/payroll/format';

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/layout/usePageHeader', () => ({ usePageHeader: () => undefined }));
vi.mock('@/components/branch-cash/BranchCashPanel', () => ({
  default: () => <div>panel</div>,
  BRANCH_CASH_KEY: ['branch-cash'],
}));

const branchCashApi = { summary: vi.fn(), categories: vi.fn().mockResolvedValue({ data: [] }) };
const branchesApi = { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Main' }, { id: 2, name: 'Cubao' }] }) };
vi.mock('@/lib/apiServices', () => ({ branchCashApi, branchesApi }));

const { default: CashReportsPage } = await import('./page');

const totals = (over = {}) => ({
  sales: 1000, expenses: 0, vale: 0, expected: 1000, actualCash: 990, overShort: -10, state: 'SHORT', drift: [], ...over,
});

describe('Cash Reports page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = ['branch-cash', 'all-branches', 'branch-cash:verify', 'branch-cash:categories'];
    branchCashApi.summary.mockResolvedValue({
      data: {
        rows: [
          { branchId: 2, branchName: 'Cubao', date: '2026-10-02', status: 'OPEN', totals: totals({ actualCash: null, overShort: null, state: 'NOT_COUNTED' }) },
          { branchId: 1, branchName: 'Main', date: '2026-10-01', status: 'VERIFIED', totals: totals() },
        ],
        totals: { sales: 2000, expenses: 0, vale: 0, expected: 2000, actualCash: 990, overShort: -10, days: 2, unverifiedDays: 1, notCountedDays: 1 },
      },
    });
  });

  it('lists branch-days with their status and the period totals', async () => {
    renderWithQuery(<CashReportsPage />);
    expect((await screen.findAllByText('Cubao')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not counted').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`Short ${peso(10)}`).length).toBeGreaterThan(0);
    expect(screen.getByText('1 of 2 days unverified')).toBeInTheDocument();
  });

  it('offers category management only with the key', async () => {
    renderWithQuery(<CashReportsPage />);
    expect(await screen.findByRole('button', { name: 'Categories' })).toBeInTheDocument();
  });

  it('hides the branch filter from a branch-scoped user', async () => {
    auth.permissions = ['branch-cash'];
    renderWithQuery(<CashReportsPage />);
    await screen.findAllByText('Cubao');
    expect(screen.queryByLabelText('Branch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Categories' })).toBeNull();
  });
});
```

Run: `npx vitest run "src/app/(app)/branch-cash/page.spec.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the categories dialog**

`src/app/(app)/branch-cash/_components/CategoriesDialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { branchCashApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import { BRANCH_CASH_KEY } from '@/components/branch-cash/BranchCashPanel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/** Add, rename, reorder and (de)activate expense categories. Never deletes. */
export default function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const { data: categories = [] } = useQuery({
    queryKey: [...BRANCH_CASH_KEY, 'categories', 'all'],
    queryFn: () => branchCashApi.categories(true).then((r) => r.data),
    enabled: open,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: [...BRANCH_CASH_KEY, 'categories'] });

  const create = useMutation({
    mutationFn: () => branchCashApi.createCategory({ name: name.trim(), sortOrder: (categories.length + 1) * 10 }),
    onSuccess: () => {
      setName('');
      refresh();
    },
    onError: (err) => toast.error(extractError(err)),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; requiresNote?: boolean; sortOrder?: number; isActive?: boolean } }) =>
      branchCashApi.updateCategory(id, data),
    onSuccess: refresh,
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
        </DialogHeader>
        <ul className="space-y-2">
          {categories.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Name of ${c.name}`}
                defaultValue={c.name}
                className="h-8 min-w-0 flex-1"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next && next !== c.name) update.mutate({ id: c.id, data: { name: next } });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move ${c.name} up`}
                disabled={i === 0}
                onClick={() => {
                  const prev = categories[i - 1];
                  update.mutate({ id: c.id, data: { sortOrder: prev.sortOrder } });
                  update.mutate({ id: prev.id, data: { sortOrder: c.sortOrder } });
                }}
              >
                ↑
              </Button>
              <label className="flex items-center gap-1 text-xs">
                <Switch
                  checked={c.requiresNote}
                  onCheckedChange={(v) => update.mutate({ id: c.id, data: { requiresNote: v } })}
                />
                Note required
              </label>
              <label className="flex items-center gap-1 text-xs">
                <Switch checked={c.isActive} onCheckedChange={(v) => update.mutate({ id: c.id, data: { isActive: v } })} />
                Active
              </label>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category" maxLength={60} />
          <Button type="submit" disabled={!name.trim() || create.isPending}>Add</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement the page**

`src/app/(app)/branch-cash/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { usePageHeader } from '@/components/layout/usePageHeader';
import { branchCashApi, branchesApi } from '@/lib/apiServices';
import { addDays, manilaToday } from '@/lib/manilaDate';
import { peso } from '@/lib/payroll/format';
import { useCan } from '@/lib/rbac/useHasFeature';
import type { Branch, CashDayTotals, CashSummaryRow } from '@/types';
import BranchCashPanel from '@/components/branch-cash/BranchCashPanel';
import QueryError from '@/components/QueryError';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import CategoriesDialog from './_components/CategoriesDialog';

function stateLabel(t: CashDayTotals): string {
  if (t.state === 'NOT_COUNTED') return 'Not counted';
  if (t.state === 'BALANCED') return 'Balanced';
  return `${t.state === 'OVER' ? 'Over' : 'Short'} ${peso(Math.abs(t.overShort ?? 0))}`;
}

const STATE_CLASS: Record<CashDayTotals['state'], string> = {
  NOT_COUNTED: 'text-muted-foreground',
  BALANCED: 'text-green-700 dark:text-green-400',
  OVER: 'text-amber-700 dark:text-amber-400',
  SHORT: 'text-red-700 dark:text-red-400',
};

/**
 * Every branch-day's drawer for a period: sales, expenses, vale, expected and
 * counted cash. Opening a row shows the same panel managers fill in, where an
 * admin verifies it.
 */
export default function CashReportsPage() {
  usePageHeader({ title: 'Cash Reports' });
  const allBranches = useCan('all-branches');
  const canManageCategories = useCan('branch-cash:categories');
  const today = manilaToday();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [openRow, setOpenRow] = useState<CashSummaryRow | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list().then((r) => r.data),
    enabled: allBranches,
  });
  const summaryQuery = useQuery({
    queryKey: ['branch-cash', 'summary', from, to, branchId, unverified],
    queryFn: () =>
      branchCashApi
        .summary({ from, to, branchId: branchId ? Number(branchId) : undefined, unverified })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cash-from" className="text-xs text-muted-foreground">From</label>
          <Input id="cash-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="cash-to" className="text-xs text-muted-foreground">To</label>
          <Input id="cash-to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
        </div>
        {allBranches ? (
          <div>
            <label htmlFor="cash-branch" className="text-xs text-muted-foreground">Branch</label>
            <select
              id="cash-branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={unverified} onCheckedChange={setUnverified} />
          Unverified only
        </label>
        {canManageCategories ? (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setCategoriesOpen(true)}>
            Categories
          </Button>
        ) : null}
      </div>

      {summaryQuery.isError ? (
        <QueryError error={summaryQuery.error} onRetry={() => summaryQuery.refetch()} />
      ) : !summary ? null : (
        <>
          <p className="text-sm text-muted-foreground">
            {summary.totals.unverifiedDays} of {summary.totals.days} days unverified
          </p>

          {/* Phones: one card per branch-day. */}
          <ul className="space-y-2 md:hidden">
            {summary.rows.map((r) => (
              <li key={`${r.branchId}|${r.date}`}>
                <button
                  type="button"
                  onClick={() => setOpenRow(r)}
                  className="w-full rounded-lg border p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{r.branchName}</span>
                    <Badge variant={r.status === 'VERIFIED' ? 'default' : 'outline'}>
                      {r.status === 'VERIFIED' ? 'Verified' : 'Open'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{dayjs(r.date).format('ddd, MMM D')}</div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span>Expected {peso(r.totals.expected)}</span>
                    <span className={STATE_CLASS[r.totals.state]}>{stateLabel(r.totals)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {/* Wider screens: the table. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Vale</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead>Over / short</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.rows.map((r) => (
                  <TableRow key={`${r.branchId}|${r.date}`} className="cursor-pointer" onClick={() => setOpenRow(r)}>
                    <TableCell>{dayjs(r.date).format('ddd, MMM D')}</TableCell>
                    <TableCell>{r.branchName}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.sales)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.expenses)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.vale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{peso(r.totals.expected)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totals.actualCash == null ? '—' : peso(r.totals.actualCash)}
                    </TableCell>
                    <TableCell className={STATE_CLASS[r.totals.state]}>{stateLabel(r.totals)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === 'VERIFIED' ? 'default' : 'outline'}>
                        {r.status === 'VERIFIED' ? 'Verified' : 'Open'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.expenses)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.vale)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.expected)}</TableCell>
                  <TableCell className="text-right tabular-nums">{peso(summary.totals.actualCash)}</TableCell>
                  <TableCell colSpan={2}>{peso(summary.totals.overShort)} on counted days</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      <Sheet open={openRow != null} onOpenChange={(v) => !v && setOpenRow(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {openRow ? `${openRow.branchName} — ${dayjs(openRow.date).format('ddd, MMM D, YYYY')}` : ''}
            </SheetTitle>
          </SheetHeader>
          {openRow ? <BranchCashPanel branchId={openRow.branchId} date={openRow.date} /> : null}
        </SheetContent>
      </Sheet>

      {canManageCategories ? <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} /> : null}
    </div>
  );
}
```

If `src/components/ui/table.tsx` does not export `TableFooter`, render the totals row as the last `TableRow` of `TableBody` with `className="font-semibold"` instead of adding the component.

- [ ] **Step 5: Run the frontend suites**

Run: `npx vitest run "src/app/(app)/branch-cash" "src/app/(app)/inventory" src/components/branch-cash src/components/layout`
Expected: PASS.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no errors in the new or changed files.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/inventory/details/page.tsx" "src/app/(app)/branch-cash"
git commit -m "feat(branch-cash): cash panel on the inventory sheet and the Cash Reports page" -m "<trailer>"
```

---

### Task 12: Documentation, full verification and the migration

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: updated project docs; a verified branch; the migrations applied only with the user's explicit go-ahead.

- [ ] **Step 1: Update `AGENTS.md`**

In the backend module list, add `branch-cash` after `payroll`.

In **Key domain rules**, add after the "Sold is derived, never recorded" bullet:

```markdown
- **Expenses and vale are not sales.** They are recorded per branch per day in
  `branch-cash` and only change the *expected cash*:
  `sales − expenses − vale` (`src/server/branch-cash/compute-cash-day.ts`).
  Sales, revenue and the dashboard are unaffected.
```

Add a section after the Payroll section:

```markdown
### Branch cash

Spec: `docs/superpowers/specs/2026-09-24-branch-cash-design.md`.

- **The bottom of the paper sheet.** Managers record drawer expenses (by
  admin-managed `ExpenseCategory`), vale (cash advances, per `Employee`) and the
  counted cash on `/inventory/details`; admins review and verify on
  `/branch-cash`.
- **Sales comes from `SalesService`**, never recomputed here, so the figure
  matches the sales page.
- **A verified branch-day is locked** (expenses, vale, counted cash) until an
  admin reopens it. Writers take advisory lock namespace **5**. Inventory is
  never locked; a sales change after verification shows as drift.
- **Vale is deducted by payroll automatically.** `computePayslip` reads
  `BranchVale` rows in the cutoff; nothing is copied. A vale in a finalized
  cutoff cannot change (`assertCutoffOpen`), and employee date changes that
  would leave a vale outside employment are refused.
- Managers get `branch-cash` + `:create/:edit/:delete`; only admins get
  `:verify` and `:categories`.
```

- [ ] **Step 2: Run the full verification**

Stop any running dev server first (Windows EPERM on `prisma generate`).

Run: `npm run lint && npm run test && npm run build`
Expected: lint clean; every vitest and jest suite PASS; the build succeeds. Paste the summary lines into the task report. If anything fails, stop and fix it before continuing. Do not skip.

- [ ] **Step 3: Commit the docs**

```bash
git add AGENTS.md
git commit -m "docs: branch cash — expenses and vale are not sales; vale feeds payroll" -m "<trailer>"
```

- [ ] **Step 4: STOP — ask before touching any database**

The local `.env` points at the **production** Supabase database. Ask the user, and wait for an explicit answer:

> "Both branch-cash migrations (`20261001100000_branch_cash_tables`, `20261001110000_branch_cash_feature_keys`) are additive: four new tables, one enum, check constraints, five seeded expense categories and six Feature rows, with no change to existing data. They require the payroll migrations to be applied first (`BranchVale` references `Employee`). How should they be applied: (a) to a separate development database first (give me its `DATABASE_URL`), or (b) to production with `npm run prisma:deploy` now, after you've taken a backup?"

Only then run `npm run prisma:deploy` against the database they named, and report its output.

- [ ] **Step 5: Manual check (non-production database only)**

Only against a development database. Never create test entries in production.

Run: `npm run build && npm start`, then:
1. As an admin, open Cash Reports → Categories: the five seeded categories show; add "Ice".
2. Sign in as a MANAGER assigned to a branch. Open Inventory, pick today. The Cash section is at the bottom of the sheet.
3. Add expenses "Ice ₱60" and "Other ₱100" (the Add button stays disabled for Other until a note is typed). Add a vale of ₱500 for an employee. Type `1,250` style amounts and confirm they save correctly.
4. Enter counted cash. Check expected = sales − expenses − vale, and that over/short matches.
5. As the admin, open Cash Reports, find the row, open it and Verify. Back as the manager: the section is read-only.
6. As the admin, change a leftover on that day's inventory. The verified day shows "Sales changed since verification".
7. Open Payroll for the cutoff containing today: the employee's draft shows "Vale — <branch>, <date>" as a deduction.
8. Finalize that payroll run, reopen the cash day, and try to void the vale: it is refused ("…is finalized. Void its payroll run to change it.").
9. As a VIEWER, there is no Cash Reports in the sidebar and `/branch-cash` redirects away.

Report what happened at each step, including anything that did not match.
