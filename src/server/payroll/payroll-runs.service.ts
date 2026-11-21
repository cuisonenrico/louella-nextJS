import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cutoffOf, cutoffsOfYear } from '@/lib/payroll/cutoff';
import { manilaToday } from '@/lib/manilaDate';
import { PrismaService } from '../prisma/prisma.service';
import { num } from '../common/utils/decimal.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { recordChanges } from '../common/utils/audit.util';
import { PayrollDraftService } from './payroll-draft.service';
import { day, lockCutoff, lockEmployeeInputs } from './payroll-lock.util';
import * as XLSX from 'xlsx';
import { buildPayrollWorkbook, slug, type CompanyDetails, type WorkbookSlip } from './payroll-workbook';

/** The `company` query value meaning payslips with no company. */
export const NO_COMPANY_PARAM = '__none__';

const RUN_INCLUDE = {
  payslips: {
    orderBy: { employeeName: 'asc' },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.PayrollRunInclude;

type RunRow = Prisma.PayrollRunGetPayload<{ include: typeof RUN_INCLUDE }>;

function toRunView(run: RunRow) {
  return { ...run, periodStart: day(run.periodStart), periodEnd: day(run.periodEnd) };
}

/**
 * Finalized payroll. A run is a frozen snapshot: nothing edits it after
 * finalize except its status. Mistakes are fixed by voiding (the run stays on
 * record) and finalizing the cutoff again.
 */
@Injectable()
export class PayrollRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: PayrollDraftService,
  ) {}

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

  async listCutoffs(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be between 2000 and 2100');
    }
    const runs = await this.prisma.payrollRun.findMany({
      where: { periodStart: { gte: toUtcDay(`${year}-01-01`), lte: toUtcDay(`${year}-12-16`) } },
      select: { id: true, periodStart: true, status: true, employeeCount: true, totalNetPay: true, totalEmployerShare: true },
    });
    return cutoffsOfYear(year).map(({ periodStart, periodEnd }) => {
      const mine = runs.filter((r) => day(r.periodStart) === periodStart);
      const active = mine.find((r) => r.status !== 'VOIDED');
      return {
        periodStart,
        periodEnd,
        status: (active?.status ?? 'OPEN') as 'OPEN' | 'FINALIZED' | 'PAID',
        runId: active?.id ?? null,
        employeeCount: active?.employeeCount ?? null,
        totalNetPay: active ? num(active.totalNetPay) : null,
        totalEmployerShare: active ? num(active.totalEmployerShare) : null,
        voidedRuns: mine.filter((r) => r.status === 'VOIDED').length,
      };
    });
  }

  finalize(periodStart: string, userId: number, now: Date = new Date()) {
    return this.prisma.$transaction(
      async (tx) => {
        // Not before the cutoff's last day (Manila): finalizing locks the
        // cutoff, so an early run would count the remaining days as worked and
        // refuse the absences and branch vale still to come.
        const { periodEnd } = cutoffOf(periodStart);
        if (periodEnd > manilaToday(now)) {
          throw new BadRequestException(`This cutoff runs until ${periodEnd}. Finalize it on or after that day.`);
        }
        // Lock first: absences/adjustments/skips take the same lock, so none
        // can land between the recompute below and the insert.
        await lockCutoff(tx, periodStart);
        // Rates, schedules and deductions cannot change while the draft is read.
        await lockEmployeeInputs(tx, 'shared');
        const existing = await tx.payrollRun.findFirst({
          where: { periodStart: toUtcDay(periodStart), status: { not: 'VOIDED' } },
          select: { id: true },
        });
        if (existing) throw new ConflictException('This cutoff already has a payroll run');

        const draft = await this.drafts.build(periodStart, tx);
        if (draft.hasBlocking) {
          throw new BadRequestException('Resolve the blocking warnings (missing rates) before finalizing');
        }
        if (draft.payslips.length === 0) {
          throw new BadRequestException('Nobody was employed during this cutoff');
        }

        const run = await tx.payrollRun.create({
          data: {
            periodStart: toUtcDay(draft.periodStart),
            periodEnd: toUtcDay(draft.periodEnd),
            status: 'FINALIZED',
            employeeCount: draft.totals.employeeCount,
            totalNetPay: draft.totals.netPay,
            totalEmployerShare: draft.totals.employerShare,
            finalizedById: userId,
          },
        });

        // Two inserts for the whole run, not one per employee: the payslips,
        // then every line keyed to its payslip.
        const slips = await tx.payslip.createManyAndReturn({
          data: draft.payslips.map((p) => ({
            runId: run.id,
            employeeId: p.employeeId,
            employeeName: p.employeeName,
            jobRoleName: p.jobRoleName,
            branchName: p.branchName,
            companyId: p.companyId,
            companyName: p.companyName,
            workingDays: p.workingDays,
            absenceDays: p.absenceDays,
            daysWorked: p.daysWorked,
            basicPay: p.basicPay,
            holidayPay: p.holidayPay,
            totalAdditions: p.totalAdditions,
            totalDeductions: p.totalDeductions,
            netPay: p.netPay,
            totalEmployerShare: p.totalEmployerShare,
          })),
          select: { id: true, employeeId: true },
        });
        const slipIdByEmployee = new Map(slips.map((s) => [s.employeeId, s.id]));
        await tx.payslipLine.createMany({
          data: draft.payslips.flatMap((p) =>
            p.lines.map((l, i) => ({
              payslipId: slipIdByEmployee.get(p.employeeId)!,
              sortOrder: i,
              type: l.type,
              label: l.label,
              quantity: l.quantity,
              rate: l.rate,
              amount: l.amount,
              sourceType: l.sourceType,
              sourceId: l.sourceId,
            })),
          ),
        });

        await recordChanges(tx, [{ entity: 'PayrollRun', entityId: run.id, before: null, after: run }], userId);
        return toRunView(await tx.payrollRun.findUniqueOrThrow({ where: { id: run.id }, include: RUN_INCLUDE }));
      },
      { timeout: 30_000 },
    );
  }

  markPaid(runId: number, userId: number) {
    return this.prisma
      .$transaction(async (tx) => {
        const before = await this.lockedRun(tx, runId);
        if (before.status !== 'FINALIZED') {
          throw new ConflictException(`A ${before.status.toLowerCase()} run cannot be marked paid`);
        }
        const after = await tx.payrollRun.update({
          where: { id: runId },
          data: { status: 'PAID', paidAt: new Date(), paidById: userId },
        });
        await recordChanges(tx, [{ entity: 'PayrollRun', entityId: runId, before, after }], userId);
      })
      .then(() => this.getRun(runId));
  }

  voidRun(runId: number, reason: string, userId: number) {
    return this.prisma
      .$transaction(async (tx) => {
        const before = await this.lockedRun(tx, runId);
        if (before.status === 'VOIDED') throw new ConflictException('This run is already voided');
        const after = await tx.payrollRun.update({
          where: { id: runId },
          data: { status: 'VOIDED', voidedAt: new Date(), voidedById: userId, voidReason: reason.trim() },
        });
        await recordChanges(tx, [{ entity: 'PayrollRun', entityId: runId, before, after }], userId);
      })
      .then(() => this.getRun(runId));
  }

  /**
   * The run, re-read under its cutoff's lock. Finalize takes the same lock, so
   * a void and a paid (or a re-finalize) on one cutoff cannot interleave.
   */
  private async lockedRun(tx: Prisma.TransactionClient, runId: number) {
    const found = await tx.payrollRun.findUnique({ where: { id: runId }, select: { periodStart: true } });
    if (!found) throw new NotFoundException('Payroll run not found');
    await lockCutoff(tx, day(found.periodStart));
    const run = await tx.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async getRun(runId: number) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: RUN_INCLUDE });
    return toRunView(run);
  }

  /**
   * The run as an XLSX payroll register, one sheet per company. `company`
   * limits it to one company's sheet (`__none__` = payslips with no company),
   * so that business's file shows nobody else's pay. A voided run is not the
   * payroll of record and is refused.
   */
  async exportRun(runId: number, company?: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId }, include: RUN_INCLUDE });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'VOIDED') throw new ConflictException('A voided run cannot be exported');

    let only: { company: string | null } | undefined;
    if (company !== undefined) {
      only = { company: company === NO_COMPANY_PARAM ? null : company };
      if (!run.payslips.some((p) => p.companyName === only!.company)) {
        throw new NotFoundException('No payslip in this run belongs to that company');
      }
    }

    // Adjustment categories pick the column (overtime, NSD…). A finalized
    // cutoff's adjustments are locked, so reading them now gives what the
    // run used. Names print "Last, First" as on the paper sheet.
    const adjustmentIds = run.payslips.flatMap((p) =>
      p.lines.filter((l) => l.sourceType === 'PayrollAdjustment' && l.sourceId !== null).map((l) => l.sourceId!),
    );
    const companyIds = [...new Set(run.payslips.map((p) => p.companyId).filter((id): id is number => id !== null))];
    const [adjustments, employees, companies] = await Promise.all([
      this.prisma.payrollAdjustment.findMany({ where: { id: { in: adjustmentIds } }, select: { id: true, category: true } }),
      this.prisma.employee.findMany({
        where: { id: { in: run.payslips.map((p) => p.employeeId) } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, address: true, paymasterName: true, approverName: true },
      }),
    ]);
    const categoryById = new Map(adjustments.map((a) => [a.id, a.category as string]));
    const nameById = new Map(employees.map((e) => [e.id, `${e.lastName}, ${e.firstName}`]));
    const companyById = new Map(companies.map((c) => [c.id, c]));

    const slips: WorkbookSlip[] = run.payslips.map((p) => ({
      employeeName: nameById.get(p.employeeId) ?? p.employeeName,
      companyName: p.companyName,
      daysWorked: p.daysWorked,
      netPay: num(p.netPay),
      lines: p.lines.map((l) => ({
        type: l.type,
        label: l.label,
        rate: l.rate === null ? null : num(l.rate),
        amount: num(l.amount),
        sourceType: l.sourceType,
        category: l.sourceType === 'PayrollAdjustment' && l.sourceId !== null ? categoryById.get(l.sourceId) ?? null : null,
      })),
    }));
    // The address and signatories are the company's current ones; the name
    // on each sheet is the payslips' snapshot.
    const details = new Map<string, CompanyDetails>();
    for (const p of run.payslips) {
      const c = p.companyId !== null ? companyById.get(p.companyId) : undefined;
      if (p.companyName !== null && c && !details.has(p.companyName)) details.set(p.companyName, c);
    }

    const periodStart = day(run.periodStart);
    const wb = buildPayrollWorkbook({ id: run.id, periodStart, periodEnd: day(run.periodEnd) }, slips, details, only);
    const suffix = only === undefined ? 'all' : only.company === null ? 'no-company' : slug(only.company);
    return {
      buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      fileName: `payroll-${periodStart}-${suffix}.xlsx`,
    };
  }

  async getPayslip(id: number) {
    const slip = await this.prisma.payslip.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        run: { select: { id: true, periodStart: true, periodEnd: true, status: true } },
      },
    });
    if (!slip) throw new NotFoundException('Payslip not found');
    return { ...slip, run: { ...slip.run, periodStart: day(slip.run.periodStart), periodEnd: day(slip.run.periodEnd) } };
  }
}
