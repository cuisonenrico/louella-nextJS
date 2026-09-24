import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type BranchCashDay } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';
import { recordChanges } from '../common/utils/audit.util';
import { centavos, num, pesos } from '../common/utils/decimal.util';
import { MAX_REPORT_RANGE_DAYS, assertDateRange, toUtcDay } from '../common/utils/date-range.util';
import { day } from '../payroll/payroll-lock.util';
import { computeCashDay, type CashDayTotals, type CashSnapshot } from './compute-cash-day';
import { lockCashDay } from './branch-cash-lock.util';

type Db = Prisma.TransactionClient | PrismaService;
type Status = 'OPEN' | 'VERIFIED';

export interface CashDayView {
  branchId: number;
  date: string;
  status: Status;
  verifiedAt: string | null;
  verifiedBy: string | null;
  note: string | null;
  expenses: { id: number; category: { id: number; name: string }; amount: number; note: string | null }[];
  vale: { id: number; employee: { id: number; name: string }; amount: number; note: string | null }[];
  totals: CashDayTotals;
}

export interface CashSummaryRow {
  branchId: number;
  branchName: string;
  date: string;
  status: Status;
  totals: CashDayTotals;
}

export interface CashSummary {
  rows: CashSummaryRow[];
  totals: {
    sales: number;
    expenses: number;
    vale: number;
    expected: number;
    actualCash: number;
    overShort: number;
    days: number;
    unverifiedDays: number;
    notCountedDays: number;
  };
}

export interface ValeEmployeeOption {
  id: number;
  name: string;
  branchId: number | null;
}

type SnapshotFields = Pick<BranchCashDay, 'status' | 'salesAtVerify' | 'expensesAtVerify' | 'valeAtVerify'>;

function snapshotOf(row: SnapshotFields | null | undefined): CashSnapshot | null {
  if (row?.status !== 'VERIFIED') return null;
  return { sales: num(row.salesAtVerify), expenses: num(row.expensesAtVerify), vale: num(row.valeAtVerify) };
}

const amountOrNull = (value: Prisma.Decimal | number | null | undefined) => (value == null ? null : num(value));

/**
 * Reads and sign-off for a branch-day's drawer.
 *
 * Sales comes from SalesService so the figure here is the one on the sales
 * page. Expected cash and over/short come from computeCashDay, for one day
 * and for every row of a period alike.
 */
@Injectable()
export class BranchCashDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
  ) {}

  async getDay(branchId: number, date: string): Promise<CashDayView> {
    const [sales, lines, cashDay] = await Promise.all([
      this.salesOn(branchId, date),
      this.lines(this.prisma, branchId, date),
      this.prisma.branchCashDay.findUnique({ where: { branchId_date: { branchId, date: toUtcDay(date) } } }),
    ]);
    const verifier = cashDay?.verifiedById
      ? await this.prisma.user.findUnique({ where: { id: cashDay.verifiedById }, select: { email: true } })
      : null;

    return {
      branchId,
      date,
      status: cashDay?.status ?? 'OPEN',
      verifiedAt: cashDay?.verifiedAt?.toISOString() ?? null,
      verifiedBy: verifier?.email ?? null,
      note: cashDay?.note ?? null,
      expenses: lines.expenses.map((e) => ({ id: e.id, category: e.category, amount: num(e.amount), note: e.note })),
      vale: lines.vale.map((v) => ({
        id: v.id,
        employee: { id: v.employee.id, name: `${v.employee.firstName} ${v.employee.lastName}` },
        amount: num(v.amount),
        note: v.note,
      })),
      totals: computeCashDay({
        sales,
        expenseAmounts: lines.expenses.map((e) => num(e.amount)),
        valeAmounts: lines.vale.map((v) => num(v.amount)),
        actualCash: amountOrNull(cashDay?.actualCash),
        snapshot: snapshotOf(cashDay),
      }),
    };
  }

  async summary(q: { from: string; to: string; branchId?: number; unverified?: boolean }): Promise<CashSummary> {
    const gte = toUtcDay(q.from);
    const lte = toUtcDay(q.to);
    assertDateRange(gte, lte, MAX_REPORT_RANGE_DAYS);

    const branches = await this.prisma.branch.findMany({
      where: { deletedAt: null, ...(q.branchId != null ? { id: q.branchId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const branchIds = branches.map((b) => b.id);
    const where = { branchId: { in: branchIds }, date: { gte, lte }, deletedAt: null };
    const amountSelect = { branchId: true, date: true, amount: true } as const;

    const [expenses, vale, cashDays, salesByBranch] = await Promise.all([
      this.prisma.branchExpense.findMany({ where, select: amountSelect }),
      this.prisma.branchVale.findMany({ where, select: amountSelect }),
      this.prisma.branchCashDay.findMany({ where: { branchId: { in: branchIds }, date: { gte, lte } } }),
      // One call per branch; there are only a handful.
      Promise.all(branches.map((b) => this.sales.getDailySummary(b.id, q.from, q.to))),
    ]);

    type Acc = { branchId: number; date: string; sales: number; expenses: number[]; vale: number[]; cashDay: BranchCashDay | null };
    const byKey = new Map<string, Acc>();
    const at = (branchId: number, date: string): Acc => {
      const key = `${branchId}|${date}`;
      let acc = byKey.get(key);
      if (!acc) {
        acc = { branchId, date, sales: 0, expenses: [], vale: [], cashDay: null };
        byKey.set(key, acc);
      }
      return acc;
    };
    for (const s of salesByBranch) for (const d of s.dailySummary) at(s.branchId, d.date).sales = d.totalSales;
    for (const e of expenses) at(e.branchId, day(e.date)).expenses.push(num(e.amount));
    for (const v of vale) at(v.branchId, day(v.date)).vale.push(num(v.amount));
    for (const c of cashDays) at(c.branchId, day(c.date)).cashDay = c;

    const names = new Map(branches.map((b) => [b.id, b.name]));
    let rows: CashSummaryRow[] = [...byKey.values()].map((a) => ({
      branchId: a.branchId,
      branchName: names.get(a.branchId) ?? '',
      date: a.date,
      status: a.cashDay?.status ?? 'OPEN',
      totals: computeCashDay({
        sales: a.sales,
        expenseAmounts: a.expenses,
        valeAmounts: a.vale,
        actualCash: amountOrNull(a.cashDay?.actualCash),
        snapshot: snapshotOf(a.cashDay),
      }),
    }));
    if (q.unverified) rows = rows.filter((r) => r.status !== 'VERIFIED');
    rows.sort((x, y) => y.date.localeCompare(x.date) || x.branchName.localeCompare(y.branchName));

    const add = (pick: (t: CashDayTotals) => number | null) =>
      pesos(rows.reduce((s, r) => s + centavos(pick(r.totals) ?? 0), 0));
    return {
      rows,
      totals: {
        sales: add((t) => t.sales),
        expenses: add((t) => t.expenses),
        vale: add((t) => t.vale),
        expected: add((t) => t.expected),
        actualCash: add((t) => t.actualCash),
        overShort: add((t) => t.overShort),
        days: rows.length,
        unverifiedDays: rows.filter((r) => r.status !== 'VERIFIED').length,
        notCountedDays: rows.filter((r) => r.totals.state === 'NOT_COUNTED').length,
      },
    };
  }

  verify(branchId: number, date: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await lockCashDay(tx, branchId, date);
      const before = await tx.branchCashDay.findUnique({ where: { branchId_date: { branchId, date: toUtcDay(date) } } });
      if (before?.status === 'VERIFIED') throw new ConflictException('This day is already verified.');
      if (!before || before.actualCash == null) {
        throw new BadRequestException('Enter the counted cash before verifying.');
      }
      const [sales, lines] = await Promise.all([this.salesOn(branchId, date), this.lines(tx, branchId, date)]);
      const totals = computeCashDay({
        sales,
        expenseAmounts: lines.expenses.map((e) => num(e.amount)),
        valeAmounts: lines.vale.map((v) => num(v.amount)),
        actualCash: num(before.actualCash),
        snapshot: null,
      });
      const after = await tx.branchCashDay.update({
        where: { id: before.id },
        data: {
          status: 'VERIFIED',
          verifiedById: userId,
          verifiedAt: new Date(),
          salesAtVerify: totals.sales,
          expensesAtVerify: totals.expenses,
          valeAtVerify: totals.vale,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchCashDay', entityId: after.id, before, after }], userId);
      return after;
    });
  }

  reopen(branchId: number, date: string, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await lockCashDay(tx, branchId, date);
      const before = await tx.branchCashDay.findUnique({ where: { branchId_date: { branchId, date: toUtcDay(date) } } });
      if (before?.status !== 'VERIFIED') throw new ConflictException('This day is not verified.');
      const after = await tx.branchCashDay.update({
        where: { id: before.id },
        data: {
          status: 'OPEN',
          verifiedById: null,
          verifiedAt: null,
          salesAtVerify: null,
          expensesAtVerify: null,
          valeAtVerify: null,
        },
      });
      await recordChanges(tx, [{ entity: 'BranchCashDay', entityId: after.id, before, after }], userId);
      return after;
    });
  }

  /** People who can take a vale that day — the payroll rule — branch's own first. */
  async employeesFor(branchId: number, date: string): Promise<ValeEmployeeOption[]> {
    const d = toUtcDay(date);
    const rows = await this.prisma.employee.findMany({
      where: { deletedAt: null, hiredOn: { lte: d }, OR: [{ separatedOn: null }, { separatedOn: { gte: d } }] },
      select: { id: true, firstName: true, lastName: true, branchId: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const own = (r: { branchId: number | null }) => (r.branchId === branchId ? 0 : 1);
    return [...rows]
      .sort((a, b) => own(a) - own(b))
      .map((r) => ({ id: r.id, name: `${r.firstName} ${r.lastName}`, branchId: r.branchId }));
  }

  private async salesOn(branchId: number, date: string): Promise<number> {
    const result = await this.sales.getByBranchAndDate(branchId, date);
    return result.totals.totalSales;
  }

  private async lines(db: Db, branchId: number, date: string) {
    const where = { branchId, date: toUtcDay(date), deletedAt: null };
    const [expenses, vale] = await Promise.all([
      db.branchExpense.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { id: 'asc' },
      }),
      db.branchVale.findMany({
        where,
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { expenses, vale };
  }
}
