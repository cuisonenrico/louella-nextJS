import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/branch-cash.dto';

type Tx = Prisma.TransactionClient;

/** The short list a manager picks from. Deactivated, never deleted. */
@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive = false) {
    return this.prisma.expenseCategory.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(dto: CreateCategoryDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const name = dto.name.trim();
      await this.assertNameFree(tx, name);
      const row = await tx.expenseCategory.create({
        data: { name, requiresNote: dto.requiresNote ?? false, sortOrder: dto.sortOrder ?? 0 },
      });
      await recordChanges(tx, [{ entity: 'ExpenseCategory', entityId: row.id, before: null, after: row }], userId);
      return row;
    });
  }

  update(id: number, dto: UpdateCategoryDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.expenseCategory.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Category not found');
      const data: Prisma.ExpenseCategoryUpdateInput = {};
      if (dto.name !== undefined) {
        data.name = dto.name.trim();
        await this.assertNameFree(tx, data.name, id);
      }
      if (dto.requiresNote !== undefined) data.requiresNote = dto.requiresNote;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;
      const after = await tx.expenseCategory.update({ where: { id }, data });
      await recordChanges(tx, [{ entity: 'ExpenseCategory', entityId: id, before, after }], userId);
      return after;
    });
  }

  /** Case-insensitive: "utilities" next to "Utilities" is a typo, not a category. */
  private async assertNameFree(tx: Tx, name: string, exceptId?: number) {
    const clash = await tx.expenseCategory.findFirst({
      where: {
        deletedAt: null,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId != null ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A category named "${name}" already exists.`);
  }
}
