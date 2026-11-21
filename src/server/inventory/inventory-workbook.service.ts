import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { num } from '../common/utils/decimal.util';
import {
  assertDateRange,
  eachDayInclusive,
  MAX_REPORT_RANGE_DAYS,
  toUtcDay,
} from '../common/utils/date-range.util';
import {
  TYPE_ORDER,
  writeInventoryWorkbook,
  type WorkbookCash,
  type WorkbookDay,
  type WorkbookProduct,
  type WorkbookRow,
} from './inventory-workbook';

const day = (d: Date) => d.toISOString().slice(0, 10);
const manilaToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

/**
 * Loads one branch's inventory and cash days for a range and hands them to
 * the workbook builder (`inventory-workbook.ts`).
 *
 * Read-only. Products listed are every active product plus any inactive one
 * that has a row in the range, so each day sheet lists the same products in
 * the same order, as the paper sheet did.
 */
@Injectable()
export class InventoryWorkbookService {
  constructor(private readonly prisma: PrismaService) {}

  async export(branchId: number, from: string, to: string) {
    const gte = toUtcDay(from);
    const lte = toUtcDay(to);
    assertDateRange(gte, lte, MAX_REPORT_RANGE_DAYS);

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { name: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const range = { branchId, date: { gte, lte } };
    const [rows, expenses, vale, cashDays] = await Promise.all([
      this.prisma.inventory.findMany({
        where: { ...range, deletedAt: null },
        include: { adjustments: { where: { deletedAt: null }, select: { type: true, value: true } } },
      }),
      this.prisma.branchExpense.findMany({ where: { ...range, deletedAt: null }, select: { date: true, amount: true } }),
      this.prisma.branchVale.findMany({ where: { ...range, deletedAt: null }, select: { date: true, amount: true } }),
      this.prisma.branchCashDay.findMany({ where: range, select: { date: true, actualCash: true, status: true } }),
    ]);

    const withRows = [...new Set(rows.map((r) => r.productId))];
    const productRecords = await this.prisma.product.findMany({
      where: { deletedAt: null, OR: [{ isActive: true }, { id: { in: withRows } }] },
      select: { id: true, name: true, type: true, price: true, sortOrder: true, isEquipment: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const products: WorkbookProduct[] = productRecords
      .filter((p) => TYPE_ORDER.includes(p.type))
      .map((p) => ({ id: p.id, name: p.name, type: p.type, price: num(p.price), isEquipment: p.isEquipment }));

    const rowsByDay = new Map<string, WorkbookRow[]>();
    for (const r of rows) {
      let pullIn = 0;
      let pullOut = 0;
      for (const a of r.adjustments) {
        // Same rule as computeAdjSum: only PULL_IN adds; PULL_OUT and ANOMALY take away.
        if (a.type === 'PULL_IN') pullIn += num(a.value);
        else pullOut += num(a.value);
      }
      const list = rowsByDay.get(day(r.date)) ?? [];
      list.push({
        productId: r.productId,
        opening: r.quantity,
        delivery: r.delivery,
        pullIn,
        pullOut,
        leftover: r.leftoverCountedAt ? r.leftover : null,
        reject: r.reject ?? 0,
      });
      rowsByDay.set(day(r.date), list);
    }

    const cashByDay = new Map<string, WorkbookCash>();
    const cashAt = (d: string) => {
      let c = cashByDay.get(d);
      if (!c) {
        c = { expenses: 0, vale: 0, actualCash: null, status: 'OPEN' };
        cashByDay.set(d, c);
      }
      return c;
    };
    // Whole centavos, so a column of ₱12.10s cannot drift.
    for (const e of expenses) cashAt(day(e.date)).expenses = Math.round(cashAt(day(e.date)).expenses * 100 + num(e.amount) * 100) / 100;
    for (const v of vale) cashAt(day(v.date)).vale = Math.round(cashAt(day(v.date)).vale * 100 + num(v.amount) * 100) / 100;
    for (const c of cashDays) {
      const at = cashAt(day(c.date));
      at.actualCash = c.actualCash == null ? null : num(c.actualCash);
      at.status = c.status === 'VERIFIED' ? 'VERIFIED' : 'OPEN';
    }

    const days: WorkbookDay[] = eachDayInclusive(gte, lte).map((d) => ({
      date: day(d),
      rows: rowsByDay.get(day(d)) ?? [],
      cash: cashByDay.get(day(d)) ?? { expenses: 0, vale: 0, actualCash: null, status: 'OPEN' },
    }));

    const buffer = await writeInventoryWorkbook({
      branchName: branch.name,
      from,
      to,
      pricedOn: manilaToday(),
      products,
      days,
    });
    return { buffer, fileName: `inventory-${branch.name.replace(/[^\w-]+/g, '_')}-${from}-to-${to}.xlsx` };
  }
}
