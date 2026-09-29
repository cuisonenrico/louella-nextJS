import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Holiday, Prisma } from '@prisma/client';
import { cutoffOf, weekdayOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { toUtcDay } from '../common/utils/date-range.util';
import { recordChanges } from '../common/utils/audit.util';
import { assertCutoffOpen, day } from './payroll-lock.util';
import { CreateHolidayDto, CreateRestDayWorkDto, UpdateHolidayDto } from './dto/holiday.dto';

function toHolidayView(h: Holiday, locked: boolean) {
  return { id: h.id, date: day(h.date), name: h.name, type: h.type, isClosed: h.isClosed, locked };
}

/**
 * Holidays and rest-day work marks. Every writer locks the cutoff containing
 * the holiday's date first (assertCutoffOpen), so a finalized cutoff's
 * holidays cannot change until its run is voided.
 */
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(year: number) {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('year must be between 2000 and 2100');
    }
    const [rows, runs] = await Promise.all([
      this.prisma.holiday.findMany({
        where: { deletedAt: null, date: { gte: toUtcDay(`${year}-01-01`), lte: toUtcDay(`${year}-12-31`) } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.payrollRun.findMany({
        where: { status: { not: 'VOIDED' }, periodStart: { gte: toUtcDay(`${year}-01-01`), lte: toUtcDay(`${year}-12-16`) } },
        select: { periodStart: true },
      }),
    ]);
    const finalized = new Set(runs.map((r) => day(r.periodStart)));
    return rows.map((h) => toHolidayView(h, finalized.has(cutoffOf(day(h.date)).periodStart)));
  }

  create(dto: CreateHolidayDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await assertCutoffOpen(tx, cutoffOf(dto.date).periodStart);
      const clash = await tx.holiday.findFirst({ where: { date: toUtcDay(dto.date), deletedAt: null } });
      if (clash) throw new ConflictException(`${dto.date} already has a holiday (${clash.name})`);
      const created = await tx.holiday.create({
        data: {
          date: toUtcDay(dto.date),
          name: dto.name.trim(),
          type: dto.type,
          isClosed: dto.isClosed ?? false,
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'Holiday', entityId: created.id, before: null, after: created }], userId);
      return toHolidayView(created, false);
    });
  }

  update(id: number, dto: UpdateHolidayDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await this.requireHoliday(tx, id);
      await assertCutoffOpen(tx, cutoffOf(day(initial.date)).periodStart);
      // Re-read after the lock: another writer may have deleted it while we waited.
      const before = await this.requireHoliday(tx, id);
      if (dto.isClosed === true && !before.isClosed) {
        const marks = await tx.holidayRestDayWork.count({ where: { holidayId: id, deletedAt: null } });
        if (marks > 0) {
          throw new ConflictException('Remove the rest-day work marks first: a closed holiday was worked by nobody');
        }
      }
      const after = await tx.holiday.update({
        where: { id },
        data: { name: dto.name?.trim(), type: dto.type, isClosed: dto.isClosed },
      });
      await recordChanges(tx, [{ entity: 'Holiday', entityId: id, before, after }], userId);
      return toHolidayView(after, false);
    });
  }

  remove(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await this.requireHoliday(tx, id);
      await assertCutoffOpen(tx, cutoffOf(day(initial.date)).periodStart);
      // Re-read after the lock: another writer may have deleted it while we waited.
      const before = await this.requireHoliday(tx, id);
      const after = await tx.holiday.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'Holiday', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }

  addRestDayWork(holidayId: number, dto: CreateRestDayWorkDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await this.requireHoliday(tx, holidayId);
      await assertCutoffOpen(tx, cutoffOf(day(initial.date)).periodStart);
      // Re-read after the lock: another writer may have deleted or closed it while we waited.
      const holiday = await this.requireHoliday(tx, holidayId);
      const date = day(holiday.date);
      if (holiday.isClosed) throw new BadRequestException('Nobody works a closed holiday');
      const employee = await tx.employee.findFirst({ where: { id: dto.employeeId, deletedAt: null } });
      if (!employee) throw new NotFoundException('Employee not found');
      const employed = day(employee.hiredOn) <= date && (employee.separatedOn === null || day(employee.separatedOn) >= date);
      if (!employed) throw new BadRequestException(`The employee was not employed on ${date}`);
      if (!employee.restDays.includes(weekdayOf(date))) {
        throw new BadRequestException(`${date} is not this employee's rest day`);
      }
      const existing = await tx.holidayRestDayWork.findFirst({
        where: { holidayId, employeeId: dto.employeeId, deletedAt: null },
      });
      if (existing) throw new ConflictException('Already marked as worked');
      const created = await tx.holidayRestDayWork.create({
        data: { holidayId, employeeId: dto.employeeId, createdById: userId },
      });
      await recordChanges(tx, [{ entity: 'HolidayRestDayWork', entityId: created.id, before: null, after: created }], userId);
      return { id: created.id };
    });
  }

  removeRestDayWork(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.holidayRestDayWork.findFirst({
        where: { id, deletedAt: null },
        include: { holiday: { select: { date: true } } },
      });
      if (!before) throw new NotFoundException('Mark not found');
      await assertCutoffOpen(tx, cutoffOf(day(before.holiday.date)).periodStart);
      const after = await tx.holidayRestDayWork.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'HolidayRestDayWork', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }

  private async requireHoliday(tx: Prisma.TransactionClient, id: number) {
    const holiday = await tx.holiday.findFirst({ where: { id, deletedAt: null } });
    if (!holiday) throw new NotFoundException('Holiday not found');
    return holiday;
  }
}
