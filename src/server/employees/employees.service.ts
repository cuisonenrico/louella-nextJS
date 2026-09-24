import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { manilaToday } from '@/lib/manilaDate';
import { PrismaService } from '../prisma/prisma.service';
import { num } from '../common/utils/decimal.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { recordChanges } from '../common/utils/audit.util';
import { day, employeeLockedThrough } from '../payroll/payroll-lock.util';
import { CreateEmployeeDto, CreateRateDto, ListEmployeesQuery, UpdateEmployeeDto } from './dto/employee.dto';

export const EMPLOYEE_INCLUDE = {
  jobRole: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { id: true, email: true, role: true, isActive: true } },
  rates: { where: { deletedAt: null }, orderBy: { effectiveOn: 'desc' } },
} satisfies Prisma.EmployeeInclude;

type EmployeeRow = Prisma.EmployeeGetPayload<{ include: typeof EMPLOYEE_INCLUDE }>;

/** The API shape of an employee. Dates are Manila days. */
export function toEmployeeView(e: EmployeeRow, today: string = manilaToday()) {
  const separatedOn = e.separatedOn ? day(e.separatedOn) : null;
  const current = e.rates.find((r) => day(r.effectiveOn) <= today) ?? null;
  return {
    id: e.id,
    firstName: e.firstName,
    lastName: e.lastName,
    fullName: `${e.firstName} ${e.lastName}`,
    jobRole: e.jobRole,
    branch: e.branch,
    restDays: e.restDays,
    hiredOn: day(e.hiredOn),
    separatedOn,
    isActive: separatedOn === null || separatedOn >= today,
    phone: e.phone,
    address: e.address,
    currentDailyRate: current ? num(current.dailyRate) : null,
    account: e.user
      ? { userId: e.user.id, email: e.user.email, role: e.user.role, isActive: e.user.isActive }
      : null,
  };
}

export type EmployeeView = ReturnType<typeof toEmployeeView>;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The live employee, or 404. */
  async requireEmployee(id: number, db: Prisma.TransactionClient = this.prisma) {
    const employee = await db.employee.findFirst({ where: { id, deletedAt: null }, include: EMPLOYEE_INCLUDE });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async list(q: ListEmployeesQuery) {
    const rows = await this.prisma.employee.findMany({
      where: { deletedAt: null, branchId: q.branchId, jobRoleId: q.jobRoleId },
      include: EMPLOYEE_INCLUDE,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const views = rows.map((r) => toEmployeeView(r));
    const status = q.status ?? 'active';
    if (status === 'all') return views;
    return views.filter((v) => v.isActive === (status === 'active'));
  }

  async get(id: number) {
    return toEmployeeView(await this.requireEmployee(id));
  }

  create(dto: CreateEmployeeDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertActiveJobRole(tx, dto.jobRoleId);
      const hiredOn = toUtcDay(dto.hiredOn);
      const created = await tx.employee.create({
        data: {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          jobRoleId: dto.jobRoleId,
          branchId: dto.branchId ?? null,
          restDays: normalizeRestDays(dto.restDays ?? [0]),
          hiredOn,
          phone: dto.phone?.trim() || null,
          address: dto.address?.trim() || null,
          rates: { create: { dailyRate: dto.dailyRate, effectiveOn: hiredOn, createdById: userId } },
        },
        include: EMPLOYEE_INCLUDE,
      });
      await recordChanges(tx, [{ entity: 'Employee', entityId: created.id, before: null, after: created }], userId);
      return toEmployeeView(created);
    });
  }

  update(id: number, dto: UpdateEmployeeDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireEmployee(id, tx);
      if (dto.jobRoleId !== undefined && dto.jobRoleId !== before.jobRoleId) {
        await this.assertActiveJobRole(tx, dto.jobRoleId);
      }
      const after = await tx.employee.update({
        where: { id },
        data: {
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          jobRoleId: dto.jobRoleId,
          branchId: dto.branchId === undefined ? undefined : dto.branchId,
          restDays: dto.restDays === undefined ? undefined : normalizeRestDays(dto.restDays),
          hiredOn: dto.hiredOn === undefined ? undefined : toUtcDay(dto.hiredOn),
          phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
          address: dto.address === undefined ? undefined : dto.address?.trim() || null,
        },
        include: EMPLOYEE_INCLUDE,
      });
      await recordChanges(tx, [{ entity: 'Employee', entityId: id, before, after }], userId);
      return toEmployeeView(after);
    });
  }

  setSeparation(id: number, separatedOn: string | null, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.requireEmployee(id, tx);
      if (separatedOn !== null && separatedOn < day(before.hiredOn)) {
        throw new BadRequestException('The separation date cannot be before the hire date');
      }
      const after = await tx.employee.update({
        where: { id },
        data: { separatedOn: separatedOn === null ? null : toUtcDay(separatedOn) },
        include: EMPLOYEE_INCLUDE,
      });
      await recordChanges(tx, [{ entity: 'Employee', entityId: id, before, after }], userId);
      return toEmployeeView(after);
    });
  }

  async listRates(id: number) {
    await this.requireEmployee(id);
    const rates = await this.prisma.employeeRate.findMany({
      where: { employeeId: id, deletedAt: null },
      orderBy: { effectiveOn: 'desc' },
    });
    return rates.map((r) => ({ id: r.id, dailyRate: num(r.dailyRate), effectiveOn: day(r.effectiveOn), createdAt: r.createdAt }));
  }

  addRate(id: number, dto: CreateRateDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.requireEmployee(id, tx);
      await this.assertRateDateOpen(tx, id, dto.effectiveOn);
      const created = await tx.employeeRate.create({
        data: { employeeId: id, dailyRate: dto.dailyRate, effectiveOn: toUtcDay(dto.effectiveOn), createdById: userId },
      });
      await recordChanges(tx, [{ entity: 'EmployeeRate', entityId: created.id, before: null, after: created }], userId);
      return { id: created.id, dailyRate: num(created.dailyRate), effectiveOn: day(created.effectiveOn), createdAt: created.createdAt };
    });
  }

  removeRate(id: number, rateId: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const rate = await tx.employeeRate.findFirst({ where: { id: rateId, employeeId: id, deletedAt: null } });
      if (!rate) throw new NotFoundException('Rate not found');
      await this.assertRateDateOpen(tx, id, day(rate.effectiveOn));
      const after = await tx.employeeRate.update({ where: { id: rateId }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'EmployeeRate', entityId: rateId, before: rate, after, action: 'delete' }], userId);
      return { id: rateId };
    });
  }

  private async assertActiveJobRole(tx: Prisma.TransactionClient, jobRoleId: number) {
    const role = await tx.jobRole.findUnique({ where: { id: jobRoleId } });
    if (!role || !role.isActive) throw new BadRequestException('Choose an active job role');
  }

  /** Rates dated on or before the employee's last finalized day are fixed. */
  private async assertRateDateOpen(tx: Prisma.TransactionClient, employeeId: number, effectiveOn: string) {
    const lockedThrough = await employeeLockedThrough(tx, employeeId);
    if (lockedThrough !== null && effectiveOn <= lockedThrough) {
      throw new ConflictException(
        `Pay through ${lockedThrough} is finalized, so rates dated on or before it are fixed. Date the rate after ${lockedThrough}, or void that payroll run first.`,
      );
    }
  }
}

function normalizeRestDays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}
