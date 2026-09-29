import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import { num } from '../common/utils/decimal.util';
import { UpdatePayrollSettingsDto } from './dto/holiday.dto';
import { readMultipliers } from './payroll-settings';

/**
 * The holiday multipliers. Drafts read them live; finalized payslips keep the
 * multiplier on each line, so a change here never touches history — which is
 * why writes take no cutoff lock.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const m = await readMultipliers(this.prisma);
    return { regularHolidayMultiplier: m.regular, specialHolidayMultiplier: m.special };
  }

  update(dto: UpdatePayrollSettingsDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.payrollSettings.findUnique({ where: { id: 1 } });
      const data = {
        ...(dto.regularHolidayMultiplier !== undefined && { regularHolidayMultiplier: dto.regularHolidayMultiplier }),
        ...(dto.specialHolidayMultiplier !== undefined && { specialHolidayMultiplier: dto.specialHolidayMultiplier }),
        updatedById: userId,
      };
      const after = await tx.payrollSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
      await recordChanges(tx, [{ entity: 'PayrollSettings', entityId: 1, before, after }], userId);
      return {
        regularHolidayMultiplier: num(after.regularHolidayMultiplier),
        specialHolidayMultiplier: num(after.specialHolidayMultiplier),
      };
    });
  }
}
