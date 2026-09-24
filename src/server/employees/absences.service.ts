import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { cutoffOf, weekdayOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { assertDateRange, toUtcDay } from '../common/utils/date-range.util';
import { recordChanges } from '../common/utils/audit.util';
import { assertCutoffOpen, day } from '../payroll/payroll-lock.util';
import { CreateAbsenceDto, ListAbsencesQuery } from './dto/absence.dto';

/** A quarter: enough for any calendar view, bounded for the scan. */
const MAX_ABSENCE_RANGE_DAYS = 92;

type Row = { id: number; employeeId: number; date: Date; note: string | null };

function toView(a: Row) {
  return { id: a.id, employeeId: a.employeeId, date: day(a.date), note: a.note };
}

/**
 * Everyone is assumed present on every working day; an absence is the
 * exception the admin records. Absences inside a finalized cutoff are frozen.
 */
@Injectable()
export class AbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAbsencesQuery) {
    const from = toUtcDay(q.from);
    const to = toUtcDay(q.to);
    assertDateRange(from, to, MAX_ABSENCE_RANGE_DAYS);
    const rows = await this.prisma.absence.findMany({
      where: { deletedAt: null, employeeId: q.employeeId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    });
    return rows.map(toView);
  }

  create(dto: CreateAbsenceDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findFirst({ where: { id: dto.employeeId, deletedAt: null } });
      if (!employee) throw new NotFoundException('Employee not found');

      const hiredOn = day(employee.hiredOn);
      const separatedOn = employee.separatedOn ? day(employee.separatedOn) : null;
      if (dto.date < hiredOn || (separatedOn !== null && dto.date > separatedOn)) {
        throw new BadRequestException(`The employee is not employed on ${dto.date}`);
      }
      if (employee.restDays.includes(weekdayOf(dto.date))) {
        throw new BadRequestException(`${dto.date} is a rest day for this employee`);
      }
      await assertCutoffOpen(tx, cutoffOf(dto.date).periodStart);

      const created = await tx.absence.create({
        data: { employeeId: dto.employeeId, date: toUtcDay(dto.date), note: dto.note?.trim() || null, createdById: userId },
      });
      await recordChanges(tx, [{ entity: 'Absence', entityId: created.id, before: null, after: created }], userId);
      return toView(created);
    });
  }

  remove(id: number, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.absence.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Absence not found');
      await assertCutoffOpen(tx, cutoffOf(day(before.date)).periodStart);
      const after = await tx.absence.update({ where: { id }, data: { deletedAt: new Date() } });
      await recordChanges(tx, [{ entity: 'Absence', entityId: id, before, after, action: 'delete' }], userId);
      return { id };
    });
  }
}
