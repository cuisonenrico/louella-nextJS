import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cutoffOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { centavos, num, pesos } from '../common/utils/decimal.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { computePayslip, type ComputedPayslip } from './compute-payslip';
import { day } from './payroll-lock.util';

export interface DraftPayslip extends ComputedPayslip {
  employeeName: string;
  jobRoleName: string;
  branchName: string | null;
  /** 1–15 cutoff only: each active recurring deduction and its skip, if any. */
  recurring: { id: number; name: string; employeeShare: number; skipId: number | null }[];
}

export interface CutoffDraft {
  periodStart: string;
  periodEnd: string;
  payslips: DraftPayslip[];
  totals: { employeeCount: number; netPay: number; employerShare: number };
  hasBlocking: boolean;
}

/**
 * The live, never-stored payroll for an open cutoff. Finalize calls this
 * inside its own transaction and freezes the result, so the admin finalizes
 * exactly what they reviewed.
 */
@Injectable()
export class PayrollDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async build(periodStart: string, db: Prisma.TransactionClient = this.prisma): Promise<CutoffDraft> {
    const cutoff = cutoffOf(periodStart);
    const start = toUtcDay(cutoff.periodStart);
    const end = toUtcDay(cutoff.periodEnd);

    const employees = await db.employee.findMany({
      where: {
        deletedAt: null,
        hiredOn: { lte: end },
        OR: [{ separatedOn: null }, { separatedOn: { gte: start } }],
      },
      include: {
        jobRole: { select: { name: true } },
        branch: { select: { name: true } },
        rates: { where: { deletedAt: null, effectiveOn: { lte: end } }, orderBy: { effectiveOn: 'asc' } },
        absences: { where: { deletedAt: null, date: { gte: start, lte: end } } },
        adjustments: { where: { deletedAt: null, periodStart: start }, orderBy: { id: 'asc' } },
        recurringDeductions: { where: { isActive: true }, orderBy: { id: 'asc' } },
        skips: { where: { deletedAt: null, periodStart: start } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const payslips: DraftPayslip[] = employees.map((e) => {
      const recurring = e.recurringDeductions.map((r) => ({
        id: r.id,
        name: r.name,
        employeeShare: num(r.employeeShare),
        employerShare: num(r.employerShare),
      }));
      const computed = computePayslip({
        employee: {
          id: e.id,
          restDays: e.restDays,
          hiredOn: day(e.hiredOn),
          separatedOn: e.separatedOn ? day(e.separatedOn) : null,
        },
        cutoff,
        rates: e.rates.map((r) => ({ id: r.id, dailyRate: num(r.dailyRate), effectiveOn: day(r.effectiveOn) })),
        absences: e.absences.map((a) => day(a.date)),
        adjustments: e.adjustments.map((a) => ({
          id: a.id,
          kind: a.kind,
          category: a.category,
          description: a.description,
          amount: num(a.amount),
        })),
        recurring,
        skippedRecurringIds: e.skips.map((s) => s.recurringDeductionId),
      });
      const skipByDeduction = new Map(e.skips.map((s) => [s.recurringDeductionId, s.id]));
      return {
        ...computed,
        employeeName: `${e.firstName} ${e.lastName}`,
        jobRoleName: e.jobRole.name,
        branchName: e.branch?.name ?? null,
        recurring:
          cutoff.half === 1
            ? recurring.map((r) => ({
                id: r.id,
                name: r.name,
                employeeShare: r.employeeShare,
                skipId: skipByDeduction.get(r.id) ?? null,
              }))
            : [],
      };
    });

    const net = payslips.reduce((sum, p) => sum + centavos(p.netPay), 0);
    const employer = payslips.reduce((sum, p) => sum + centavos(p.totalEmployerShare), 0);
    return {
      periodStart: cutoff.periodStart,
      periodEnd: cutoff.periodEnd,
      payslips,
      totals: { employeeCount: payslips.length, netPay: pesos(net), employerShare: pesos(employer) },
      hasBlocking: payslips.some((p) => p.warnings.some((w) => w.blocking)),
    };
  }
}
