import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HolidaysService } from './holidays.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

const holidayRow = (over: Record<string, unknown> = {}) => ({
  id: 90, date: at('2026-09-06'), name: 'Holiday', type: 'SPECIAL', isClosed: false, deletedAt: null, ...over,
});

describe('HolidaysService', () => {
  let prisma: Record<string, any>;
  let service: HolidaysService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      payrollRun: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      holiday: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(holidayRow()),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve(holidayRow({ ...data, id: 91 }))),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(holidayRow(data))),
      },
      holidayRestDayWork: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 5 }),
        update: jest.fn().mockResolvedValue({ id: 5 }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-01-05'), separatedOn: null }),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new HolidaysService(prisma as never);
  });

  describe('list', () => {
    it('flags holidays whose cutoff is finalized', async () => {
      prisma.holiday.findMany.mockResolvedValue([holidayRow(), holidayRow({ id: 92, date: at('2026-09-20') })]);
      prisma.payrollRun.findMany.mockResolvedValue([{ periodStart: at('2026-09-01') }]);
      const rows = await service.list(2026);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null, date: { gte: at('2026-01-01'), lte: at('2026-12-31') } },
        orderBy: { date: 'asc' },
      });
      expect(rows.map((r) => [r.date, r.locked])).toEqual([['2026-09-06', true], ['2026-09-20', false]]);
    });

    it('refuses a nonsense year', async () => {
      await expect(service.list(99)).rejects.toThrow(BadRequestException);
    });
  });

  describe('create', () => {
    it('creates an open holiday in an open cutoff, trimming the name', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      const view = await service.create({ date: '2026-12-25', name: ' Christmas Day ', type: 'REGULAR' }, 7);
      expect(prisma.holiday.create).toHaveBeenCalledWith({
        data: { date: at('2026-12-25'), name: 'Christmas Day', type: 'REGULAR', isClosed: false, createdById: 7 },
      });
      expect(view).toMatchObject({ id: 91, date: '2026-12-25', locked: false });
    });

    it('refuses a second live holiday on the same date', async () => {
      await expect(service.create({ date: '2026-09-06', name: 'Dup', type: 'REGULAR' }, 7)).rejects.toThrow(ConflictException);
    });

    it('refuses a finalized cutoff', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.create({ date: '2026-09-06', name: 'X', type: 'REGULAR' }, 7)).rejects.toThrow(ConflictException);
      expect(prisma.holiday.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('refuses to close a holiday that has rest-day marks', async () => {
      prisma.holidayRestDayWork.count.mockResolvedValue(1);
      await expect(service.update(90, { isClosed: true }, 7)).rejects.toThrow(ConflictException);
      expect(prisma.holiday.update).not.toHaveBeenCalled();
    });

    it('edits name and type in an open cutoff', async () => {
      await service.update(90, { name: 'Renamed', type: 'REGULAR' }, 7);
      expect(prisma.holiday.update).toHaveBeenCalledWith({ where: { id: 90 }, data: { name: 'Renamed', type: 'REGULAR', isClosed: undefined } });
    });

    it('refuses a finalized cutoff', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.update(90, { name: 'X' }, 7)).rejects.toThrow(ConflictException);
    });

    it('404s a deleted holiday', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.update(90, { name: 'X' }, 7)).rejects.toThrow(NotFoundException);
    });

    it('404s when the holiday was deleted between the initial read and the lock', async () => {
      prisma.holiday.findFirst.mockResolvedValueOnce(holidayRow()).mockResolvedValueOnce(null);
      await expect(service.update(90, { name: 'X' }, 7)).rejects.toThrow(NotFoundException);
      expect(prisma.holiday.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes in an open cutoff', async () => {
      await service.remove(90, 7);
      expect(prisma.holiday.update.mock.calls[0][0]).toMatchObject({ where: { id: 90 }, data: { deletedAt: expect.any(Date) } });
    });

    it('refuses a finalized cutoff', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.remove(90, 7)).rejects.toThrow(ConflictException);
    });

    it('404s when the holiday was already removed between the initial read and the lock', async () => {
      prisma.holiday.findFirst.mockResolvedValueOnce(holidayRow()).mockResolvedValueOnce(null);
      await expect(service.remove(90, 7)).rejects.toThrow(NotFoundException);
      expect(prisma.holiday.update).not.toHaveBeenCalled();
    });
  });

  describe('rest-day marks', () => {
    it('marks an employee who had the holiday as a rest day', async () => {
      await service.addRestDayWork(90, { employeeId: 1 }, 7); // Sep 6 2026 is a Sunday
      expect(prisma.holidayRestDayWork.create).toHaveBeenCalledWith({ data: { holidayId: 90, employeeId: 1, createdById: 7 } });
    });

    it('refuses a day that is not the employee’s rest day', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 1, restDays: [1], hiredOn: at('2026-01-05'), separatedOn: null });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
    });

    it('refuses a day outside the employment', async () => {
      prisma.employee.findFirst.mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-09-10'), separatedOn: null });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
      prisma.employee.findFirst.mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-01-05'), separatedOn: at('2026-09-05') });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
    });

    it('refuses a closed holiday', async () => {
      prisma.holiday.findFirst.mockResolvedValue(holidayRow({ isClosed: true }));
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
    });

    it('refuses a duplicate live mark', async () => {
      prisma.holidayRestDayWork.findFirst.mockResolvedValue({ id: 5 });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(ConflictException);
    });

    it('refuses a finalized cutoff', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(ConflictException);
    });

    it('refuses when the holiday was closed between the initial read and the lock', async () => {
      // First read (to find the date for the lock) sees it open; the re-read after the lock sees it closed.
      prisma.holiday.findFirst
        .mockResolvedValueOnce(holidayRow({ isClosed: false }))
        .mockResolvedValueOnce(holidayRow({ isClosed: true }));
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(BadRequestException);
      expect(prisma.holidayRestDayWork.create).not.toHaveBeenCalled();
    });

    it('404s when the holiday was deleted between the initial read and the lock', async () => {
      prisma.holiday.findFirst.mockResolvedValueOnce(holidayRow()).mockResolvedValueOnce(null);
      await expect(service.addRestDayWork(90, { employeeId: 1 }, 7)).rejects.toThrow(NotFoundException);
      expect(prisma.holidayRestDayWork.create).not.toHaveBeenCalled();
    });

    it('removes a mark while the cutoff is open', async () => {
      prisma.holidayRestDayWork.findFirst.mockResolvedValue({ id: 5, deletedAt: null, holiday: { date: at('2026-09-06') } });
      await service.removeRestDayWork(5, 7);
      expect(prisma.holidayRestDayWork.update.mock.calls[0][0]).toMatchObject({ where: { id: 5 }, data: { deletedAt: expect.any(Date) } });
    });

    it('refuses to remove a mark in a finalized cutoff', async () => {
      prisma.holidayRestDayWork.findFirst.mockResolvedValue({ id: 5, deletedAt: null, holiday: { date: at('2026-09-06') } });
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 3 });
      await expect(service.removeRestDayWork(5, 7)).rejects.toThrow(ConflictException);
    });
  });
});
