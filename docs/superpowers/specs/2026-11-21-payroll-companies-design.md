# Payroll companies — design

Date: 2026-11-21 · Branch: `feat/payroll-companies`

## Intent

Each Louella branch trades under its own business name. The client wants
payroll separated by business: every employee belongs to a **company**, and a
finalized payroll run can be exported as XLSX **per company**, so each
business's payroll can be handled on its own.

## Goals

- Admins create, rename and retire companies themselves (no code change to add one).
- Admins assign an employee to a company — one at a time on the employee form,
  and several at once from the employee list (needed once, for setup: every
  existing employee starts with none).
- A finalized run downloads as XLSX, split by company.
- A finalized run remembers each payslip's company as it was at finalize time.

## Non-goals

- Exporting the live draft (finalized runs only, by request).
- Separate runs, cutoffs, locks or settings per company. Pay is computed
  exactly as today; company is a label, never an input to `computePayslip`.
- Company-specific payslip headers/logos on the printed payslip.
- Linking companies to branches. An employee's company is set on the employee,
  not derived from their branch (central-kitchen staff have no branch, and
  someone may work at one branch but be paid by another business).

## Anti-goals

- Moving an employee to another company must never change which company a
  past finalized payslip belongs to.
- No hard deletes: a company is retired (`isActive = false`), never deleted.

## Approaches considered

- **A. Snapshot the company name on each payslip at finalize** — *chosen.*
  Same as `branchName` / `jobRoleName` today. Old runs never move. Runs
  finalized before this ships have no company and export under "No company";
  void and re-finalize to fix one if needed.
- B. Look up the employee's current company at export time. No new payslip
  column, but reassigning someone silently moves their past payslips into
  another business's books. Breaks "a finalized run is frozen". Rejected.
- C. Finalize payroll per company. Large rework of finalize/void/locking for
  what an export solves. Rejected.

## Design

### Data (one migration)

```prisma
model Company {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  employees Employee[]
}

model Employee {
  …
  companyId Int?
  company   Company? @relation(fields: [companyId], references: [id])
  @@index([companyId])
}

model Payslip {
  …
  companyName String?   // snapshot at finalize; null = no company
}
```

`companyId` is nullable: existing employees start with none. No backfill.

### API (Nest, `employees` module, all `@Roles(ADMIN)` + `@RequireFeature('employees')` at class level, like job roles)

- `GET /companies?includeInactive=true`, `POST /companies`, `PATCH /companies/:id`
  (name, isActive) — mirrors `JobRolesController`. Duplicate name → 409.
- Employee create/update DTOs accept `companyId` (int or null). Assigning an
  inactive or missing company → 400. Employee list/detail include `company { id, name }`.
- `POST /employees/company` `{ employeeIds: number[], companyId: number | null }`
  — bulk assign in one transaction. Same validation.
- Changing an employee's company needs **no payroll lock**: it does not affect
  pay, and finalized payslips keep their snapshot.

### Finalize

`payroll-runs.service.ts` writes `companyName: employee.company?.name ?? null`
alongside `branchName`. The draft (`computePayslip` input/output) carries the
company name through, so the snapshot is taken in the same transaction as the
rest.

### Export

- `GET /payroll/runs/:id/export?companyName=<name>` (ADMIN, `payroll` feature),
  returns an `.xlsx`. Allowed for `FINALIZED` and `PAID` runs; `VOIDED` → 409
  (a voided run is not the payroll of record).
  - Without `companyName`: one workbook, one sheet per company (sorted by name,
    "No company" last).
  - With `companyName` (or `companyName=` empty for "No company"): a workbook
    holding only that company's sheet — a file that can go to that business
    without showing anyone else's pay.
- Built by a pure function `src/server/payroll/payroll-workbook.ts` (SheetJS,
  same style as `inventory-workbook.ts`), unit-tested without a database.
- Each sheet: title rows (company name, cutoff `periodStart – periodEnd`, run
  id), then one row per employee sorted by name:
  Employee · Job role · Branch · Days worked · Absences · Basic pay ·
  Holiday pay · Additions · Deductions · Net pay · Employer share,
  then a **Total** row (Excel `SUM` formulas carrying computed values, as in the
  inventory workbook). Money summed in centavos.
- Filename: `payroll-<periodStart>-<company-slug|all>.xlsx`.

### UI

- **Employees page:** "Companies" button opens `CompaniesDialog` (copy of
  `JobRolesDialog`: add, rename, retire/restore). Company column in the table,
  and a company filter (All / each company / No company).
  Row checkboxes + "Assign company" action → pick a company (or none) → bulk endpoint.
- **Employee form** (`EmployeeFormDialog`, profile tab): Company select,
  active companies only, plus "None".
- **Run page** (`RunActions`): "Export XLSX" dropdown — "All companies (one tab
  each)" and one item per company present in that run. Hidden on voided runs.
- **Payslip view:** shows the company name when set.

### Tests

- Jest: workbook layout/totals/grouping; companies service (dup name, retire);
  employee assign validation (inactive company rejected); finalize snapshots
  `companyName`; export refuses voided runs; authz — extend
  `payroll.authz.http.spec.ts` / `rbac-matrix.spec.ts` so non-admins get 403 on
  `/companies` and the export.
- Playwright (required by AGENTS.md): admin creates a company, bulk-assigns
  employees, finalizes a cutoff, downloads the per-company XLSX and checks the
  sheet names and a net-pay total; a manager cannot reach `/companies`.
  Coverage table row added in §8 of the e2e design doc.

## Left to the builder

- Exact column widths / number formats in the sheet.
- Whether the bulk-assign selection lives in component state or a small hook.
- Migration name.

## Calls I made (not asked)

- Company set per employee, not derived from branch.
- Bulk assign from the employee list, for the initial setup.
- Both an all-companies file (tabs) and a single-company file — the client
  said "XLSX per company"; this covers both readings at little cost.
- `PAID` runs export too; `VOIDED` do not.
- Company change takes no payroll lock.
