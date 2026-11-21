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

### Export — the client's paper payroll sheet

Revised 2026-11-21 after the client sent their sheets
(`Documents/PAYROLL/Payroll-<company>-Nov15-2026.pdf`): one sheet per
business, including CONTRACTUAL and INCOMPLETE groups. Each of those is
simply its own company here.

- `GET /payroll/runs/:id/export?company=<name>` (ADMIN, `payroll` feature).
  `FINALIZED` and `PAID` runs only; `VOIDED` → 409; a company with no payslip in
  the run → 404. No `company` = one tab per company ("No company" last);
  `company=__none__` = the payslips with no company.
- Pure builder `src/server/payroll/payroll-workbook.ts` (SheetJS). Layout:
  `P A Y R O L L`, "For the period of November 1-15, 2026", "WE HEREBY
  ACKNOWLEDGE to have received from <company>, <address>…", a two-row header,
  one numbered row per employee ("Last, First"), a TOTAL of net salary, and the
  paymaster / approved-for-payment footer with the company's two signatories.
- Columns and where each payslip line goes:

  | Column | Source |
  |---|---|
  | DAYS WORKED | `daysWorked` |
  | DAILY RATE | latest BASIC line's rate |
  | BASIC RATE | Σ BASIC lines |
  | OVERTIME HRS / AMT | hours blank (not recorded); amount = additions with category `OVERTIME` |
  | HOLIDAY PAY | regular-holiday lines + `HOLIDAY` additions |
  | SPEC'L DAY PAY | special-holiday lines |
  | REST DAY PAY | holiday lines on a rest day |
  | NSD PAY | additions with the new category `NIGHT_DIFF` |
  | OTHER PAY *(not on paper)* | other additions (bonus, allowance, other) |
  | GROSS PAY | formula: sum of the above |
  | SSS / Philhealth / Pag-ibig / SSS Loan | recurring deductions, matched by name |
  | C.A. | vale (`BranchVale`) |
  | OTHER DED. *(not on paper)* | other deductions (offense, other, unmatched recurring) |
  | NET SALARY | formula: gross − deductions |
  | SIGNATURE | blank |

  The two extra columns keep gross and net adding up whenever a payslip
  carries a bonus or a penalty.
- `Company` gains `address`, `paymasterName`, `approverName` (optional). The
  sheet uses the company's current address and signatories; the name is the
  payslip snapshot. `Payslip.companyId` is stored alongside `companyName` to find them.
- SheetJS community edition writes no cell styles: no bold, borders or
  colours. The layout, merges, number formats and formulas are there.

### UI

- **Employees page:** "Companies" button opens `CompaniesDialog` (copy of
  `JobRolesDialog`: add, rename, retire/restore). Company column in the table,
  and a company filter (All / each company / No company).
  Row checkboxes + "Assign company" action → pick a company (or none) → bulk endpoint.
- **Employee form** (`EmployeeFormDialog`, profile tab): Company select,
  active companies only, plus "None".
- **Run page** (`RunActions`): "Export payroll sheet" menu — one item per company
  present in that run, then "All companies (one tab each)". Hidden on voided runs.
- **Payslip view:** headed by the company it was finalized under (else "Louella Bakery").
- **Adjustments:** new addition category "Night differential" (`NIGHT_DIFF`).

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
- From the client's sheets: OTHER PAY and OTHER DED. columns added; overtime
  hours left blank; recurring deductions sorted into SSS / PhilHealth /
  Pag-IBIG / SSS Loan by name, so they must be named that way; a
  `NIGHT_DIFF` adjustment category for the NSD column; the address and
  signatories are the company's current ones, not snapshotted.
