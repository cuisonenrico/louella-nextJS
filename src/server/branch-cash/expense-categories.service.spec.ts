import { ConflictException, NotFoundException } from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service';

function fakeDb() {
  const db = {
    expenseCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 9, isActive: true, ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 9, name: 'Ice', ...data })),
    },
    auditEvent: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
  return db;
}

describe('ExpenseCategoriesService', () => {
  it('lists active categories in sort order unless asked for all', async () => {
    const db = fakeDb();
    const service = new ExpenseCategoriesService(db as never);
    await service.list();
    expect(db.expenseCategory.findMany).toHaveBeenLastCalledWith({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    await service.list(true);
    expect(db.expenseCategory.findMany.mock.calls[1][0].where).toEqual({ deletedAt: null });
  });

  it('creates a trimmed name and audits it', async () => {
    const db = fakeDb();
    const row = await new ExpenseCategoriesService(db as never).create({ name: '  Ice  ' }, 1);
    expect(db.expenseCategory.create).toHaveBeenCalledWith({
      data: { name: 'Ice', requiresNote: false, sortOrder: 0 },
    });
    expect(row.name).toBe('Ice');
    expect(db.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses a name that differs only in case', async () => {
    const db = fakeDb();
    db.expenseCategory.findFirst.mockResolvedValue({ id: 2 });
    await expect(new ExpenseCategoriesService(db as never).create({ name: 'utilities' }, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.expenseCategory.findFirst).toHaveBeenCalledWith({
      where: { deletedAt: null, name: { equals: 'utilities', mode: 'insensitive' } },
      select: { id: true },
    });
  });

  it('deactivates rather than deletes', async () => {
    const db = fakeDb();
    db.expenseCategory.findFirst.mockResolvedValueOnce({ id: 9, name: 'Ice', isActive: true });
    await new ExpenseCategoriesService(db as never).update(9, { isActive: false }, 1);
    expect(db.expenseCategory.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { isActive: false } });
  });

  it('404s an unknown category', async () => {
    const db = fakeDb();
    await expect(new ExpenseCategoriesService(db as never).update(99, { isActive: false }, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
