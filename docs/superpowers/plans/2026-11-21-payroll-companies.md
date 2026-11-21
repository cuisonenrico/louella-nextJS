# Payroll Companies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-managed companies, employees assigned to one, and a finalized payroll run exported as XLSX per company.

**Architecture:** New `Company` lookup table (sibling of `JobRole`) in the `employees` Nest module; `Employee.companyId` nullable; `Payslip.companyName` snapshot written at finalize; pure SheetJS builder `payroll-workbook.ts` behind `GET /payroll/runs/:id/export`.

**Tech Stack:** Prisma, NestJS 11, SheetJS (`xlsx`), Next.js 16, TanStack Query, shadcn/ui, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-21-payroll-companies-design.md`

## Global Constraints

- Companies are never deleted; retire with `isActive = false`.
- All company/employee endpoints: class-level `@Roles(UserRole.ADMIN)` + `@RequireFeature('employees')`. Export: under `PayrollController` (ADMIN + `payroll`).
- Company name `@MaxLength(80)`, trimmed, unique → 409 on duplicate.
- Export allowed for `FINALIZED` and `PAID`; `VOIDED` → 409. Null company label: `No company`, sorted last.
- Money summed in centavos (`centavos`/`pesos`).
- Writes to `Employee` go through `$transaction` + `recordChanges`; add `companyId` to `AUDITED_FIELDS.Employee`, add `Company` to `AuditEntity`.

## Review Focus

- Two companies whose names differ only by characters Excel forbids in sheet names (`/ \ ? * [ ] :`) or longer than 31 chars → sheet names sanitised, truncated and de-duplicated; test in Task 3.
- Export of a run finalized before this feature (all `companyName` null) → one "No company" sheet, not an empty workbook; test in Task 3.
- Bulk-assign to a retired company → 400, no employee changed; test in Task 2.
- `companyName` filter naming a company not in the run → 404; test in Task 3.
- Renaming a company after finalize → old run still exports under the old name (snapshot); covered by e2e Task 5.

---

### Task 1: Schema + Company CRUD

**Files:**
- Modify: `prisma/schema.prisma` (Company model, `Employee.companyId` + relation + index, `Payslip.companyName String?`)
- Create: `prisma/migrations/<ts>_payroll_companies/migration.sql`
- Create: `src/server/employees/companies.controller.ts`, `companies.service.ts`, `dto/company.dto.ts`
- Modify: `employees.module.ts`, `common/utils/audit.util.ts`, `common/guards/rbac-matrix.spec.ts`
- Test: `src/server/employees/companies.service.spec.ts`

**Interfaces — Produces:** `GET/POST /companies`, `PATCH /companies/:id` returning `{ id, name, isActive }`; `CompaniesService.list(includeInactive)`, `.create(name, userId)`, `.update(id, dto, userId)`.

- [ ] Write spec: create trims name; duplicate name (P2002) → `ConflictException`; update missing id → `NotFoundException`.
- [ ] Implement (mirror `JobRolesService`; audited).
- [ ] Add controller to rbac matrix; run `npx jest src/server/employees src/server/common/guards` → PASS. Commit.

### Task 2: Employee company assignment

**Files:** `dto/employee.dto.ts` (`companyId?: number | null`; `AssignCompanyDto { employeeIds: int[] 1..500 unique, companyId: int | null }`), `employees.service.ts`, `employees.controller.ts` (`POST /employees/company`, declared before `:id` routes), `employees.service.spec.ts`.

**Produces:** `EmployeeView.company: { id, name } | null`; `EmployeesService.assignCompany(employeeIds, companyId, userId): Promise<{ updated: number }>`.

- [ ] Tests: create/update with inactive company → 400; assignCompany with retired company → 400 and no update; unknown employee id → 404; null clears.
- [ ] Implement: `assertActiveCompany(tx, id)`; no payroll lock. Commit.

### Task 3: Snapshot + workbook + export endpoint

**Files:** `payroll-draft.service.ts` (`companyName` on `DraftPayslip`), `payroll-runs.service.ts` (write snapshot; `exportRun(runId, companyName?)`), `payroll.controller.ts` (`GET runs/:id/export`), Create `payroll-workbook.ts` + spec.

**Produces:** `buildPayrollWorkbook(run: { id, periodStart, periodEnd }, slips: WorkbookSlip[], onlyCompany?: string | null): XLSX.WorkBook`; `sheetNameFor(name, used: Set<string>)`; `exportRun(...) → { buffer, fileName }` with fileName `payroll-<periodStart>-<slug|all>.xlsx`.

- [ ] Workbook spec: groups by company sorted, `No company` last; total row net = Σ net (exact pesos); invalid chars/31-char/duplicate sheet names; null-only run → one sheet.
- [ ] Runs spec: finalize writes `companyName`; export voided → 409; unknown company → 404.
- [ ] Implement; query param `company` (`__none__` = No company). Commit.

### Task 4: Frontend

**Files:** `src/types` (Company, Employee.company, Payslip.companyName), `src/lib/apiServices.ts` (`companiesApi`, `employeesApi.assignCompany`, `payrollApi.exportRun`), Create `employees/_components/CompaniesDialog.tsx`, `AssignCompanyDialog.tsx`; Modify `employees/page.tsx` (Companies button, Company column, filter, row checkboxes), `EmployeeFormDialog.tsx` + `ProfileTab.tsx` (Company select), `payroll/_components/RunActions.tsx` (Export XLSX dropdown), `PayslipView.tsx` (company line).

- [ ] Implement; `npm run lint`, `npx tsc --noEmit`, `npm run test:web` → PASS. Commit.

### Task 5: E2E

**Files:** Create `e2e/full/payroll-companies.spec.ts`; modify page objects if labels change; matrix row in `docs/superpowers/specs/2026-09-29-e2e-playwright-design.md` §8.

- [ ] Admin creates two companies, bulk-assigns, finalizes a past cutoff, downloads per-company XLSX; parse with `xlsx`, assert sheet names and net total equals API run totals for that company. Rename company → export still old name. Manager GET `/companies` → 403.
- [ ] Run `npm run e2e -- e2e/full/payroll-companies.spec.ts e2e/full/payroll.spec.ts`. Commit.
