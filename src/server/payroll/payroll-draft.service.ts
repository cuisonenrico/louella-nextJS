import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cutoffOf, weekdayOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { centavos, num, pesos } from '../common/utils/decimal.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { computePayslip, type ComputedPayslip, type HolidayInput } from './compute-payslip';
import { day } from './payroll-lock.util';
import { readMultipliers } from './payroll-settings';

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
      where: employedDuring(start, end),
      include: {
        jobRole: { select: { name: true } },
        branch: { select: { name: true } },
        rates: { where: { deletedAt: null, effectiveOn: { lte: end } }, orderBy: { effectiveOn: 'asc' } },
        absences: { where: { deletedAt: null, date: { gte: start, lte: end } } },
        adjustments: { where: { deletedAt: null, periodStart: start }, orderBy: { id: 'asc' } },
        recurringDeductions: { where: { isActive: true }, orderBy: { id: 'asc' } },
        skips: { where: { deletedAt: null, periodStart: start } },
        vale: {
          where: { deletedAt: null, date: { gte: start, lte: end } },
          include: { branch: { select: { name: true } } },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const [holidayRows, multipliers] = await Promise.all([loadHolidays(db, start, end), readMultipliers(db)]);
    const holidays: HolidayInput[] = holidayRows.map((h) => ({
      id: h.id,
      date: day(h.date),
      name: h.name,
      type: h.type,
      isClosed: h.isClosed,
    }));

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
        vale: e.vale.map((v) => ({ id: v.id, date: day(v.date), branchName: v.branch.name, amount: num(v.amount) })),
        holidays,
        restDayWorkHolidayIds: holidayRows
          .filter((h) => h.restDayWork.some((m) => m.employeeId === e.id))
          .map((h) => h.id),
        multipliers,
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
}
