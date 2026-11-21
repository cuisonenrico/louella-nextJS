import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import { UpdateCompanyDto } from './dto/company.dto';

const COMPANY_SELECT = { id: true, name: true, isActive: true } as const;

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * The businesses employees are paid by. Each branch trades under its own
 * business name, and a finalized payroll run exports one sheet per company.
 * A company is retired, never deleted: finalized payslips keep its name.
 */
@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean) {
    return this.prisma.company.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: COMPANY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string, userId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.company.create({ data: { name: name.trim() }, select: COMPANY_SELECT });
        await recordChanges(tx, [{ entity: 'Company', entityId: created.id, before: null, after: created }], userId);
        return created;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('A company with this name already exists');
      throw e;
    }
  }

  async update(id: number, dto: UpdateCompanyDto, userId: number) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = await tx.company.findUnique({ where: { id }, select: COMPANY_SELECT });
        if (!before) throw new NotFoundException('Company not found');
        const after = await tx.company.update({
          where: { id },
          data: { name: dto.name?.trim(), isActive: dto.isActive },
          select: COMPANY_SELECT,
        });
        await recordChanges(tx, [{ entity: 'Company', entityId: id, before, after }], userId);
        return after;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('A company with this name already exists');
      throw e;
    }
  }
}
