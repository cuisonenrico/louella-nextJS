import { BadRequestException, ConflictException } from '@nestjs/common';
import { BranchCashDaysService } from './branch-cash-days.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function fakeDb() {
  const db = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
    branch: { findMany: jest.fn().mockResolvedValue([]) },
    branchExpense: { findMany: jest.fn().mockResolvedValue([]) },
    branchVale: { findMany: jest.fn().mockResolvedValue([]) },
    branchCashDay: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 70, ...data })),
    },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'admin@louella.ph' }) },
    auditEvent: { createMany: jest.fn() },
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  const sales = {
    getByBranchAndDate: jest.fn().mockResolvedValue({ totals: { totalSales: 12450 } }),
    getDailySummary: jest.fn(),
  };
  return { db, sales, service: new BranchCashDaysService(db as never, sales as never) };
}

describe('BranchCashDaysService.getDay', () => {
  it('puts sales, lines and the count together', async () => {
    const { db, service } = fakeDb();
    db.branchExpense.findMany.mockResolvedValue([
      { id: 11, amount: 850, note: 'LPG', category: { id: 2, name: 'Utilities' } },
    ]);
    db.branchVale.findMany.mockResolvedValue([
      { id: 21, amount: 500, note: null, employee: { id: 5, firstName: 'Ana', lastName: 'Cruz' } },
    ]);
    db.branchCashDay.findUnique.mockResolvedValue({ status: 'OPEN', actualCash: 11050, note: null, verifiedById: null });

    const view = await service.getDay(3, '2026-10-01');

    expect(view).toMatchObject({
      branchId: 3,
      date: '2026-10-01',
      status: 'OPEN',
      verifiedBy: null,
      expenses: [{ id: 11, category: { id: 2, name: 'Utilities' }, amount: 850, note: 'LPG' }],
      vale: [{ id: 21, employee: { id: 5, name: 'Ana Cruz' }, amount: 500, note: null }],
      totals: { sales: 12450, expected: 11100, overShort: -50, state: 'SHORT', drift: [] },
    });
    expect(db.branchExpense.findMany.mock.calls[0][0].where).toEqual({
      branchId: 3,
      date: at('2026-10-01'),
      deletedAt: null,
    });
  });

  it('shows who verified and what moved since', async () => {
    const { db, sales, service } = fakeDb();
    sales.getByBranchAndDate.mockResolvedValue({ totals: { totalSales: 12510 } });
    db.branchCashDay.findUnique.mockResolvedValue({
      status: 'VERIFIED',
      actualCash: 11050,
      note: null,
      verifiedById: 1,
      verifiedAt: new Date('2026-10-02T02:00:00.000Z'),
      salesAtVerify: 12450,
      expensesAtVerify: 0,
      valeAtVerify: 0,
    });
    const view = await service.getDay(3, '2026-10-01');
    expect(view.verifiedBy).toBe('admin@louella.ph');
    expect(view.totals.drift).toEqual([{ field: 'sales', atVerify: 12450, now: 12510 }]);
  });
});

describe('BranchCashDaysService.verify / reopen', () => {
  it('refuses to verify before the cash is counted', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN', actualCash: null });
    await expect(service.verify(3, '2026-10-01', 1)).rejects.toThrow('Enter the counted cash before verifying.');
    await expect(service.verify(3, '2026-10-02', 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to verify twice', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'VERIFIED', actualCash: 1 });
    await expect(service.verify(3, '2026-10-01', 1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('snapshots the live figures under the day lock', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN', actualCash: 11050 });
    db.branchExpense.findMany.mockResolvedValue([{ id: 11, amount: 850, note: null, category: { id: 2, name: 'U' } }]);
    await service.verify(3, '2026-10-01', 1);
    const { data } = db.branchCashDay.update.mock.calls[0][0];
    expect(data).toMatchObject({
      status: 'VERIFIED',
      verifiedById: 1,
      salesAtVerify: 12450,
      expensesAtVerify: 850,
      valeAtVerify: 0,
    });
    expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.branchCashDay.findUnique.mock.invocationCallOrder[0],
    );
    expect(db.auditEvent.createMany).toHaveBeenCalled();
  });

  it('reopens by clearing the snapshot, and only a verified day', async () => {
    const { db, service } = fakeDb();
    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN' });
    await expect(service.reopen(3, '2026-10-01', 1)).rejects.toBeInstanceOf(ConflictException);

    db.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'VERIFIED' });
    await service.reopen(3, '2026-10-01', 1);
    expect(db.branchCashDay.update).toHaveBeenLastCalledWith({
      where: { id: 70 },
      data: {
        status: 'OPEN',
        verifiedById: null,
        verifiedAt: null,
        salesAtVerify: null,
        expensesAtVerify: null,
        valeAtVerify: null,
      },
    });
  });
});

describe('BranchCashDaysService.summary', () => {
  function withTwoBranches() {
    const ctx = fakeDb();
    ctx.db.branch.findMany.mockResolvedValue([
      { id: 1, name: 'Main' },
      { id: 2, name: 'Cubao' },
    ]);
    ctx.sales.getDailySummary.mockImplementation(async (branchId: number) => ({
      branchId,
      dailySummary: branchId === 1 ? [{ date: '2026-10-01', totalSales: 1000 }] : [],
    }));
    // Cubao spent on a day it had no inventory: the row must still appear.
    ctx.db.branchExpense.findMany.mockResolvedValue([{ branchId: 2, date: at('2026-10-02'), amount: 60 }]);
    ctx.db.branchCashDay.findMany.mockResolvedValue([
      { branchId: 1, date: at('2026-10-01'), status: 'VERIFIED', actualCash: 990, salesAtVerify: 1000, expensesAtVerify: 0, valeAtVerify: 0 },
    ]);
    return ctx;
  }

  it('merges sales days and cash-only days, newest first, with totals', async () => {
    const { service } = withTwoBranches();
    const summary = await service.summary({ from: '2026-10-01', to: '2026-10-07' });
    expect(summary.rows.map((r) => [r.branchName, r.date, r.status, r.totals.state])).toEqual([
      ['Cubao', '2026-10-02', 'OPEN', 'NOT_COUNTED'],
      ['Main', '2026-10-01', 'VERIFIED', 'SHORT'],
    ]);
    expect(summary.totals).toEqual({
      sales: 1000,
      expenses: 60,
      vale: 0,
      expected: 940,
      actualCash: 990,
      overShort: -10,
      days: 2,
      unverifiedDays: 1,
      notCountedDays: 1,
    });
  });

  it('filters to unverified days', async () => {
    const { service } = withTwoBranches();
    const summary = await service.summary({ from: '2026-10-01', to: '2026-10-07', unverified: true });
    expect(summary.rows.map((r) => r.branchName)).toEqual(['Cubao']);
  });

  it('limits to one branch when asked', async () => {
    const { db, service } = withTwoBranches();
    await service.summary({ from: '2026-10-01', to: '2026-10-07', branchId: 2 });
    expect(db.branch.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null, id: 2 });
  });

  it('refuses a range longer than the report cap', async () => {
    const { service } = withTwoBranches();
    await expect(service.summary({ from: '2026-01-01', to: '2026-10-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('BranchCashDaysService.employeesFor', () => {
  it('lists people employed that day, the branch’s own first', async () => {
    const { db, service } = fakeDb();
    db.employee.findMany.mockResolvedValue([
      { id: 1, firstName: 'Ben', lastName: 'Abad', branchId: 2 },
      { id: 2, firstName: 'Ana', lastName: 'Cruz', branchId: 3 },
      { id: 3, firstName: 'Cy', lastName: 'Diaz', branchId: null },
    ]);
    expect(await service.employeesFor(3, '2026-10-01')).toEqual([
      { id: 2, name: 'Ana Cruz', branchId: 3 },
      { id: 1, name: 'Ben Abad', branchId: 2 },
      { id: 3, name: 'Cy Diaz', branchId: null },
    ]);
    expect(db.employee.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      hiredOn: { lte: at('2026-10-01') },
      OR: [{ separatedOn: null }, { separatedOn: { gte: at('2026-10-01') } }],
    });
  });
});
