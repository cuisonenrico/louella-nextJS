import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cutoffOf } from '@/lib/payroll/cutoff';
import { PrismaService } from '../prisma/prisma.service';
import { recordChanges } from '../common/utils/audit.util';
import { toUtcDay } from '../common/utils/date-range.util';
import { assertCutoffOpen, day } from '../payroll/payroll-lock.util';
import { assertDayOpen, assertNotFuture } from './branch-cash-lock.util';
import type {
  CreateExpenseDto,
  CreateValeDto,
  SetActualCashDto,
  UpdateExpenseDto,
  UpdateValeDto,
} from './dto/branch-cash.dto';

type Tx = Prisma.TransactionClient;

const clean = (note?: string | null) => note?.trim() || null;
const scoped = (id: number, scopeBranchId?: number) => ({
  id,
  deletedAt: null,
  ...(scopeBranchId != null ? { branchId: scopeBranchId } : {}),
});

/**
 * Category must be active only when it is being chosen: an edit to an old
 * line's amount must not fail because its category was retired since.
 */
async function requireCategory(tx: Tx, id: number, note: string | null, mustBeActive: boolean) {
  const category = await tx.expenseCategory.findFirst({
    where: { id, deletedAt: null, ...(mustBeActive ? { isActive: true } : {}) },
    select: { name: true, requiresNote: true },
  });
  if (!category) throw new BadRequestException('Pick an active expense category.');
  if (category.requiresNote && !note) {
    throw new BadRequestException(`Add a note for "${category.name}" expenses.`);
  }
}

/** Payroll deducts the vale in this employee's cutoff, so they must be on the books that day. */
async function requireEmployee(tx: Tx, employeeId: number, date: string) {
  const d = toUtcDay(date);
  const employee = await tx.employee.findFirst({
    where: {
      id: employeeId,
      deletedAt: null,
      hiredOn: { lte: d },
      OR: [{ separatedOn: null }, { separatedOn: { gte: d } }],
    },
    select: { id: true },
  });
  if (!employee) throw new BadRequestException('That employee was not employed on this date.');
}

/**
 * The drawer lines of the paper sheet: expenses, vale and the counted cash.
 *
 * Every write runs in one transaction that first takes the branch-day lock and
 * refuses a verified day. Vale writes also take payroll's cutoff lock and refuse
 * a finalized cutoff, because the vale is already on a payslip.
 */
@Injectable()
export class BranchCashEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Expenses ───────────────────────────────────────────────────────────────

  async createExpense(dto: CreateExpenseDto, userId: number) {
    assertNotFuture(dto.date);
    return this.prisma.$transaction(async (tx) => {
      await assertDayOpen(tx, dto.branchId, dto.date);
      const note = clean(dto.note);
      await requireCategory(tx, dto.categoryId, note, true);
      const row = await tx.branchExpense.create({
        data: {
          branchId: dto.branchId,
          date: toUtcDay(dto.date),
          categoryId: dto.categoryId,
          amount: dto.amount,
          note,
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchExpense', entityId: row.id, before: null, after: row }], userId);
      return row;
    });
  }

  updateExpense(id: number, dto: UpdateExpenseDto, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedExpense(tx, id, scopeBranchId);
      const note = dto.note === undefined ? before.note : clean(dto.note);
      const categoryId = dto.categoryId ?? before.categoryId;
      await requireCategory(tx, categoryId, note, categoryId !== before.categoryId);
      const after = await tx.branchExpense.update({
        where: { id },
        data: {
          categoryId,
          note,
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          updatedById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchExpense', entityId: id, before, after }], userId);
      return after;
    });
  }

  voidExpense(id: number, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedExpense(tx, id, scopeBranchId);
      const after = await tx.branchExpense.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });
      await recordChanges(
        tx,
        [{ entity: 'BranchExpense', entityId: id, before, after, action: 'delete' }],
        userId,
      );
      return { id };
    });
  }

  /** Find (scoped), lock its day, then re-read: a concurrent void is seen after the lock. */
  private async lockedExpense(tx: Tx, id: number, scopeBranchId?: number) {
    const where = scoped(id, scopeBranchId);
    const found = await tx.branchExpense.findFirst({ where });
    if (!found) throw new NotFoundException('Expense not found');
    await assertDayOpen(tx, found.branchId, day(found.date));
    const row = await tx.branchExpense.findFirst({ where });
    if (!row) throw new NotFoundException('Expense not found');
    return row;
  }

  // ── Vale ───────────────────────────────────────────────────────────────────

  async createVale(dto: CreateValeDto, userId: number) {
    assertNotFuture(dto.date);
    return this.prisma.$transaction(async (tx) => {
      await assertDayOpen(tx, dto.branchId, dto.date);
      await assertCutoffOpen(tx, cutoffOf(dto.date).periodStart);
      await requireEmployee(tx, dto.employeeId, dto.date);
      const row = await tx.branchVale.create({
        data: {
          branchId: dto.branchId,
          date: toUtcDay(dto.date),
          employeeId: dto.employeeId,
          amount: dto.amount,
          note: clean(dto.note),
          createdById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchVale', entityId: row.id, before: null, after: row }], userId);
      return row;
    });
  }

  updateVale(id: number, dto: UpdateValeDto, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedVale(tx, id, scopeBranchId);
      const employeeId = dto.employeeId ?? before.employeeId;
      if (employeeId !== before.employeeId) await requireEmployee(tx, employeeId, day(before.date));
      const after = await tx.branchVale.update({
        where: { id },
        data: {
          employeeId,
          note: dto.note === undefined ? before.note : clean(dto.note),
          ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
          updatedById: userId,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchVale', entityId: id, before, after }], userId);
      return after;
    });
  }

  voidVale(id: number, scopeBranchId: number | undefined, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lockedVale(tx, id, scopeBranchId);
      const after = await tx.branchVale.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });
      await recordChanges(
        tx,
        [{ entity: 'BranchVale', entityId: id, before, after, action: 'delete' }],
        userId,
      );
      return { id };
    });
  }

  /** As lockedExpense, plus the payroll cutoff: a vale on a finalized payslip is fixed. */
  private async lockedVale(tx: Tx, id: number, scopeBranchId?: number) {
    const where = scoped(id, scopeBranchId);
    const found = await tx.branchVale.findFirst({ where });
    if (!found) throw new NotFoundException('Vale not found');
    const date = day(found.date);
    await assertDayOpen(tx, found.branchId, date);
    await assertCutoffOpen(tx, cutoffOf(date).periodStart);
    const row = await tx.branchVale.findFirst({ where });
    if (!row) throw new NotFoundException('Vale not found');
    return row;
  }

  // ── Counted cash ───────────────────────────────────────────────────────────

  async setActualCash(dto: SetActualCashDto, userId: number) {
    assertNotFuture(dto.date);
    return this.prisma.$transaction(async (tx) => {
      await assertDayOpen(tx, dto.branchId, dto.date);
      const date = toUtcDay(dto.date);
      const key = { branchId_date: { branchId: dto.branchId, date } };
      const before = await tx.branchCashDay.findUnique({ where: key });
      const note = dto.note === undefined ? (before?.note ?? null) : clean(dto.note);
      const after = await tx.branchCashDay.upsert({
        where: key,
        create: { branchId: dto.branchId, date, actualCash: dto.actualCash, note },
        update: { actualCash: dto.actualCash, note },
      });
      await recordChanges(tx, [{ entity: 'BranchCashDay', entityId: after.id, before, after }], userId);
      return after;
    });
  }
}
