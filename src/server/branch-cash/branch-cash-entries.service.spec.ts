import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BranchCashEntriesService } from './branch-cash-entries.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

// The fixtures are October days; pin "today" after them so the no-future-date
// rule sees them as past. Timers stay real so promises and I/O are unaffected.
beforeAll(() => {
  jest.useFakeTimers({ now: new Date('2026-10-25T04:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
});
afterAll(() => {
  jest.useRealTimers();
});

function fakeDb() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    branchCashDay: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(({ create }) => ({ id: 70, status: 'OPEN', ...create })),
    },
    branchExpense: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 11, deletedAt: null, ...data })),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 11, ...data })),
    },
    branchVale: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 21, deletedAt: null, ...data })),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 21, ...data })),
    },
    expenseCategory: {
      findFirst: jest.fn().mockResolvedValue({ name: 'Utilities', requiresNote: false }),
    },
    employee: { findFirst: jest.fn().mockResolvedValue({ id: 5 }) },
    payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
    auditEvent: { createMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { tx, service: new BranchCashEntriesService(prisma as never) };
}

const expense = { branchId: 3, date: '2026-10-01', categoryId: 2, amount: 850, note: '  LPG  ' };
const vale = { branchId: 3, date: '2026-10-01', employeeId: 5, amount: 500 };
const expenseRow = { id: 11, branchId: 3, date: at('2026-10-01'), categoryId: 2, amount: 850, note: 'LPG', deletedAt: null };
const valeRow = { id: 21, branchId: 3, date: at('2026-10-01'), employeeId: 5, amount: 500, note: null, deletedAt: null };

describe('BranchCashEntriesService — expenses', () => {
  it('records an expense with a trimmed note, under the day lock, and audits it', async () => {
    const { tx, service } = fakeDb();
    await service.createExpense(expense, 1);
    expect(tx.branchExpense.create).toHaveBeenCalledWith({
      data: { branchId: 3, date: at('2026-10-01'), categoryId: 2, amount: 850, note: 'LPG', createdById: 1 },
    });
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.branchExpense.create.mock.invocationCallOrder[0],
    );
    expect(tx.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses a verified day', async () => {
    const { tx, service } = fakeDb();
    tx.branchCashDay.findUnique.mockResolvedValue({ status: 'VERIFIED' });
    await expect(service.createExpense(expense, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.branchExpense.create).not.toHaveBeenCalled();
  });

  it('refuses a future date before opening a transaction', async () => {
    const { tx, service } = fakeDb();
    await expect(service.createExpense({ ...expense, date: '2999-01-01' }, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses an inactive category', async () => {
    const { tx, service } = fakeDb();
    tx.expenseCategory.findFirst.mockResolvedValue(null);
    await expect(service.createExpense(expense, 1)).rejects.toThrow('Pick an active expense category.');
  });

  it('requires a note where the category says so', async () => {
    const { tx, service } = fakeDb();
    tx.expenseCategory.findFirst.mockResolvedValue({ name: 'Other', requiresNote: true });
    await expect(service.createExpense({ ...expense, note: '   ' }, 1)).rejects.toThrow(
      'Add a note for "Other" expenses.',
    );
  });

  it('404s another branch’s expense for a scoped user and writes nothing', async () => {
    const { tx, service } = fakeDb();
    tx.branchExpense.findFirst.mockResolvedValue(null);
    await expect(service.updateExpense(11, { amount: 900 }, 3, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.branchExpense.findFirst.mock.calls[0][0].where).toEqual({ id: 11, deletedAt: null, branchId: 3 });
    expect(tx.branchExpense.update).not.toHaveBeenCalled();
  });

  it('edits the amount, keeping a category deactivated since', async () => {
    const { tx, service } = fakeDb();
    tx.branchExpense.findFirst.mockResolvedValue(expenseRow);
    await service.updateExpense(11, { amount: 900 }, undefined, 1);
    expect(tx.expenseCategory.findFirst.mock.calls[0][0].where).toEqual({ id: 2, deletedAt: null });
    expect(tx.branchExpense.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { categoryId: 2, note: 'LPG', amount: 900, updatedById: 1 },
    });
  });

  it('voids by stamping deletedAt, never deleting', async () => {
    const { tx, service } = fakeDb();
    tx.branchExpense.findFirst.mockResolvedValue(expenseRow);
    await expect(service.voidExpense(11, undefined, 1)).resolves.toEqual({ id: 11 });
    const { data } = tx.branchExpense.update.mock.calls[0][0];
    expect(data.deletedById).toBe(1);
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(tx.auditEvent.createMany.mock.calls[0][0].data[0].action).toBe('delete');
  });
});

describe('BranchCashEntriesService — vale', () => {
  it('records a vale for an employee employed that day', async () => {
    const { tx, service } = fakeDb();
    await service.createVale(vale, 1);
    expect(tx.employee.findFirst).toHaveBeenCalledWith({
      where: {
        id: 5,
        deletedAt: null,
        hiredOn: { lte: at('2026-10-01') },
        OR: [{ separatedOn: null }, { separatedOn: { gte: at('2026-10-01') } }],
      },
      select: { id: true },
    });
    expect(tx.branchVale.create).toHaveBeenCalledWith({
      data: { branchId: 3, date: at('2026-10-01'), employeeId: 5, amount: 500, note: null, createdById: 1 },
    });
  });

  it('refuses an employee not employed on that day', async () => {
    const { tx, service } = fakeDb();
    tx.employee.findFirst.mockResolvedValue(null);
    await expect(service.createVale(vale, 1)).rejects.toThrow('That employee was not employed on this date.');
  });

  it('refuses a vale in a finalized payroll cutoff', async () => {
    const { tx, service } = fakeDb();
    tx.payrollRun.findFirst.mockResolvedValue({ id: 1 });
    await expect(service.createVale(vale, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payrollRun.findFirst.mock.calls[0][0].where.periodStart).toEqual(at('2026-10-01'));
    expect(tx.branchVale.create).not.toHaveBeenCalled();
  });

  it('refuses to void a vale once its cutoff is finalized', async () => {
    const { tx, service } = fakeDb();
    tx.branchVale.findFirst.mockResolvedValue({ ...valeRow, date: at('2026-10-20') });
    tx.payrollRun.findFirst.mockResolvedValue({ id: 1 });
    await expect(service.voidVale(21, undefined, 1)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payrollRun.findFirst.mock.calls[0][0].where.periodStart).toEqual(at('2026-10-16'));
    expect(tx.branchVale.update).not.toHaveBeenCalled();
  });

  it('checks the new employee when a vale is reassigned', async () => {
    const { tx, service } = fakeDb();
    tx.branchVale.findFirst.mockResolvedValue(valeRow);
    await service.updateVale(21, { employeeId: 8 }, undefined, 1);
    expect(tx.employee.findFirst.mock.calls[0][0].where.id).toBe(8);
    expect(tx.branchVale.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { employeeId: 8, note: null, updatedById: 1 },
    });
  });
});

describe('BranchCashEntriesService — counted cash', () => {
  it('upserts the counted cash for the branch-day', async () => {
    const { tx, service } = fakeDb();
    await service.setActualCash({ branchId: 3, date: '2026-10-01', actualCash: 11050 }, 1);
    expect(tx.branchCashDay.upsert).toHaveBeenCalledWith({
      where: { branchId_date: { branchId: 3, date: at('2026-10-01') } },
      create: { branchId: 3, date: at('2026-10-01'), actualCash: 11050, note: null },
      update: { actualCash: 11050, note: null },
    });
  });

  it('clears the count with null', async () => {
    const { tx, service } = fakeDb();
    tx.branchCashDay.findUnique.mockResolvedValue({ id: 70, status: 'OPEN', actualCash: 11050, note: 'late' });
    await service.setActualCash({ branchId: 3, date: '2026-10-01', actualCash: null }, 1);
    expect(tx.branchCashDay.upsert.mock.calls[0][0].update).toEqual({ actualCash: null, note: 'late' });
  });

  it('refuses a verified day', async () => {
    const { tx, service } = fakeDb();
    tx.branchCashDay.findUnique.mockResolvedValue({ status: 'VERIFIED' });
    await expect(
      service.setActualCash({ branchId: 3, date: '2026-10-01', actualCash: 1 }, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
