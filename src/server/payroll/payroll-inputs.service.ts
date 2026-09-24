import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayrollAdjustmentCategory, PayrollAdjustmentKind } from '@prisma/client';
import { cutoffOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { num } from '../common/utils/decimal.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { recordChanges } from '../common/utils/audit.util';
import { employmentWindow } from './compute-payslip';
import { assertCutoffOpen, day } from './payroll-lock.util';
import { CreateAdjustmentDto, CreateSkipDto } from './dto/payroll.dto';

/** Which categories each kind may use. OTHER fits both. */
const CATEGORIES_BY_KIND: Record<PayrollAdjustmentKind, readonly PayrollAdjustmentCategory[]> = {
  ADDITION: ['OVERTIME', 'BONUS', 'HOLIDAY', 'ALLOWANCE', 'OTHER'],
  DEDUCTION: ['OFFENSE', 'OTHER'],
};

type AdjustmentRow = {
  id: number;
  employeeId: number;
  periodStart: Date;
  kind: PayrollAdjustmentKind;
  category: PayrollAdjustmentCategory;
  description: string;
  amount: unknown;
};

function toAdjustmentView(a: AdjustmentRow) {
  return {
    id: a.id,
    employeeId: a.employeeId,
    periodStart: day(a.periodStart),
    kind: a.kind,
    category: a.category,
    description: a.description,
    amount: num(a.amount as never),
  };
}

/** One-off additions/deductions and recurring-deduction skips for a cutoff. */
@Injectable()
export class PayrollInputsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdjustments(periodStart: string, employeeId?: number) {
    const rows = await this.prisma.payrollAdjustment.findMany({
      where: { deletedAt: null, periodStart: toUtcDay(periodStart), employeeId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toAdjustmentView);
  }

  // async so a validation throw below rejects the promise instead of throwing
  // synchronously out of the call.
  async createAdjustment(dto: CreateAdjustmentDto, userId: number) {
    if (!CATEGORIES_BY_KIND[dto.kind].includes(dto.category)) {
      throw new BadRequestException(`${dto.category} cannot be used for a ${dto.kind.toLowerCase()}`);
    }
    return this.prisma.$transaction(async (tx) => {
      await assertCutoffOpen(tx, dto.periodStart);
      const employee = await tx.employee.findFirst({ where: { id: dto.employeeId, deletedAt: null } });
      if (!employee) throw new NotFoundException('Employee not found');
      const window = employmentWindow(
        { hiredOn: day(employee.hiredOn), separatedOn: employee.separatedOn ? day(employee.separatedOn) : null },
        cutoffOf(dto.periodStart),
      );
      if (!window) throw new BadRequestException('The employee is not employed during this cutoff');

      const created = await tx.payrollAdjustment.create({
        data: {
          employeeId: dto.employeeId,
          periodStart: toUtcDay(dto.periodStart),
          kind: dto.kind,
          category: dto.category,
          description: dto.description.trim(),
          amount: dto.amount,
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'PayrollAdjustment', entityId: created.id, before: null, after: created }], userId);
      return toAdjustmentView(created);
    });
  }

  removeAdjustment(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.payrollAdjustment.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Adjustment not found');
      await assertCutoffOpen(tx, day(before.periodStart));
      const after = await tx.payrollAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'PayrollAdjustment', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }

  async createSkip(periodStart: string, dto: CreateSkipDto, userId: number) {
    if (cutoffOf(periodStart).half !== 1) {
      throw new BadRequestException('Recurring deductions are only taken on the 1–15 cutoff');
    }
    return this.prisma.$transaction(async (tx) => {
      await assertCutoffOpen(tx, periodStart);
      const deduction = await tx.recurringDeduction.findFirst({
        where: { id: dto.recurringDeductionId, employeeId: dto.employeeId },
      });
      if (!deduction) throw new NotFoundException('Recurring deduction not found for this employee');
      const created = await tx.recurringDeductionSkip.create({
        data: {
          employeeId: dto.employeeId,
          recurringDeductionId: dto.recurringDeductionId,
          periodStart: toUtcDay(periodStart),
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'RecurringDeductionSkip', entityId: created.id, before: null, after: created }], userId);
      return { id: created.id };
    });
  }

  removeSkip(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.recurringDeductionSkip.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Skip not found');
      await assertCutoffOpen(tx, day(before.periodStart));
      const after = await tx.recurringDeductionSkip.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'RecurringDeductionSkip', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }
}
