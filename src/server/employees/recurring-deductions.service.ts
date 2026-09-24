import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { num } from '../common/utils/decimal.util';
import { recordChanges } from '../common/utils/audit.util';
import { EmployeesService } from './employees.service';
import { CreateRecurringDeductionDto, UpdateRecurringDeductionDto } from './dto/recurring-deduction.dto';

type Row = { id: number; name: string; employeeShare: unknown; employerShare: unknown; isActive: boolean };

function toView(r: Row) {
  return {
    id: r.id,
    name: r.name,
    employeeShare: num(r.employeeShare as never),
    employerShare: num(r.employerShare as never),
    isActive: r.isActive,
  };
}

/**
 * SSS, PhilHealth, Pag-IBIG and the like: monthly amounts entered per
 * employee, taken on the 1–15 cutoff. Past payslips are snapshots, so an edit
 * here only affects cutoffs that are still open.
 */
@Injectable()
export class RecurringDeductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
  ) {}

  async list(employeeId: number) {
    await this.employees.requireEmployee(employeeId);
    const rows = await this.prisma.recurringDeduction.findMany({ where: { employeeId }, orderBy: { id: 'asc' } });
    return rows.map(toView);
  }

  create(employeeId: number, dto: CreateRecurringDeductionDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.employees.requireEmployee(employeeId, tx);
      const created = await tx.recurringDeduction.create({
        data: {
          employeeId,
          name: dto.name.trim(),
          employeeShare: dto.employeeShare,
          employerShare: dto.employerShare ?? 0,
        },
      });
      await recordChanges(tx, [{ entity: 'RecurringDeduction', entityId: created.id, before: null, after: created }], userId);
      return toView(created);
    });
  }

  update(employeeId: number, id: number, dto: UpdateRecurringDeductionDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.recurringDeduction.findFirst({ where: { id, employeeId } });
      if (!before) throw new NotFoundException('Recurring deduction not found');
      const after = await tx.recurringDeduction.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          employeeShare: dto.employeeShare,
          employerShare: dto.employerShare,
          isActive: dto.isActive,
        },
      });
      await recordChanges(tx, [{ entity: 'RecurringDeduction', entityId: id, before, after }], userId);
      return toView(after);
    });
  }
}
