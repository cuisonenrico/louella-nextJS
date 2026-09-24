import { BadRequestException, ConflictException } from '@nestjs/common';
import { AbsencesService } from './absences.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe('AbsencesService', () => {
  let prisma: Record<string, any>;
  let service: AbsencesService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 1, restDays: [0], hiredOn: at('2026-01-05'), separatedOn: at('2026-12-31') }),
      },
      payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
      absence: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 3, employeeId: 1, date: at('2026-09-02'), note: null, deletedAt: null }),
        create: jest.fn().mockResolvedValue({ id: 3, employeeId: 1, date: at('2026-09-02'), note: null }),
        update: jest.fn().mockResolvedValue({ id: 3, deletedAt: new Date() }),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new AbsencesService(prisma as never);
  });

  it('records an absence on a working day and locks its cutoff first', async () => {
    const view = await service.create({ employeeId: 1, date: '2026-09-02' }, 7);
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.payrollRun.findFirst.mock.calls[0][0].where.periodStart).toEqual(at('2026-09-01'));
    expect(prisma.absence.create).toHaveBeenCalledWith({
      data: { employeeId: 1, date: at('2026-09-02'), note: null, createdById: 7 },
    });
    expect(view).toEqual({ id: 3, employeeId: 1, date: '2026-09-02', note: null });
  });

  it('refuses a rest day', async () => {
    await expect(service.create({ employeeId: 1, date: '2026-09-06' }, 7)).rejects.toThrow(BadRequestException);
  });

  it('refuses a day outside employment', async () => {
    await expect(service.create({ employeeId: 1, date: '2026-01-02' }, 7)).rejects.toThrow(BadRequestException);
  });

  it('refuses a day in a finalized cutoff', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ id: 9 });
    await expect(service.create({ employeeId: 1, date: '2026-09-02' }, 7)).rejects.toThrow(ConflictException);
    expect(prisma.absence.create).not.toHaveBeenCalled();
  });

  it('refuses to clear an absence in a finalized cutoff', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ id: 9 });
    await expect(service.remove(3, 7)).rejects.toThrow(ConflictException);
    expect(prisma.absence.update).not.toHaveBeenCalled();
  });

  it('soft-deletes an absence in an open cutoff', async () => {
    await service.remove(3, 7);
    expect(prisma.absence.update.mock.calls[0][0]).toMatchObject({ where: { id: 3 }, data: { deletedAt: expect.any(Date) } });
  });

  it('refuses a listing wider than 92 days', async () => {
    await expect(service.list({ from: '2026-01-01', to: '2026-06-30' })).rejects.toThrow(BadRequestException);
  });
});
