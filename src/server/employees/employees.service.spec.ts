import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmployeesService, toEmployeeView } from './employees.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    firstName: 'Ana',
    lastName: 'Cruz',
    jobRoleId: 2,
    branchId: null,
    restDays: [0],
    hiredOn: at('2026-01-05'),
    separatedOn: null,
    userId: null,
    phone: null,
    address: null,
    createdAt: at('2026-01-05'),
    updatedAt: at('2026-01-05'),
    deletedAt: null,
    jobRole: { id: 2, name: 'Baker' },
    branch: null,
    user: null,
    rates: [{ id: 5, dailyRate: 600, effectiveOn: at('2026-01-05') }],
    ...overrides,
  };
}

describe('EmployeesService', () => {
  let prisma: Record<string, any>;
  let service: EmployeesService;

  beforeEach(() => {
    prisma = {
      jobRole: { findUnique: jest.fn().mockResolvedValue({ id: 2, name: 'Baker', isActive: true }) },
      employee: {
        create: jest.fn().mockResolvedValue(employeeRow()),
        findFirst: jest.fn().mockResolvedValue(employeeRow()),
        findMany: jest.fn().mockResolvedValue([employeeRow()]),
        update: jest.fn().mockResolvedValue(employeeRow()),
      },
      employeeRate: {
        create: jest.fn().mockResolvedValue({ id: 9, dailyRate: 650, effectiveOn: at('2026-09-16'), createdAt: at('2026-09-10') }),
        findFirst: jest.fn().mockResolvedValue({ id: 9, employeeId: 1, dailyRate: 650, effectiveOn: at('2026-09-16'), deletedAt: null }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 9 }),
      },
      payslip: { findFirst: jest.fn().mockResolvedValue(null) },
      branchVale: { findFirst: jest.fn().mockResolvedValue(null) },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new EmployeesService(prisma as never);
  });

  afterEach(() => jest.useRealTimers());

  it('opens the rate history on the hire date', async () => {
    await service.create(
      { firstName: ' Ana ', lastName: 'Cruz', jobRoleId: 2, hiredOn: '2026-01-05', dailyRate: 600 },
      7,
    );
    const data = prisma.employee.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ firstName: 'Ana', restDays: [0], hiredOn: at('2026-01-05') });
    expect(data.rates).toEqual({ create: { dailyRate: 600, effectiveOn: at('2026-01-05'), createdById: 7 } });
    expect(prisma.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses an inactive job role', async () => {
    prisma.jobRole.findUnique.mockResolvedValue({ id: 2, name: 'Baker', isActive: false });
    await expect(
      service.create({ firstName: 'Ana', lastName: 'Cruz', jobRoleId: 2, hiredOn: '2026-01-05', dailyRate: 600 }, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('shows the rate in effect today (Manila), not a future one', () => {
    const view = toEmployeeView(
      employeeRow({
        rates: [
          { id: 6, dailyRate: 700, effectiveOn: at('2026-10-01') },
          { id: 5, dailyRate: 600, effectiveOn: at('2026-01-05') },
        ],
      }) as never,
      '2026-09-24',
    );
    expect(view.currentDailyRate).toBe(600);
    expect(view.fullName).toBe('Ana Cruz');
    expect(view.hiredOn).toBe('2026-01-05');
  });

  it('counts an employee as active until their separation day has passed', () => {
    const row = employeeRow({ separatedOn: at('2026-09-24') });
    expect(toEmployeeView(row as never, '2026-09-24').isActive).toBe(true);
    expect(toEmployeeView(row as never, '2026-09-25').isActive).toBe(false);
  });

  it('refuses a separation date that would strand a vale', async () => {
    prisma.branchVale.findFirst.mockResolvedValue({ date: at('2026-10-02') });
    await expect(service.setSeparation(1, '2026-09-30', 7)).rejects.toThrow(ConflictException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('refuses a later hire date that would strand a vale', async () => {
    prisma.branchVale.findFirst.mockResolvedValue({ date: at('2026-01-10') });
    await expect(service.update(1, { hiredOn: '2026-02-01' }, 7)).rejects.toThrow(ConflictException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('refuses a hire date after the separation date', async () => {
    prisma.employee.findFirst.mockResolvedValue(employeeRow({ separatedOn: at('2026-06-30') }));
    await expect(service.update(1, { hiredOn: '2026-07-01' }, 7)).rejects.toThrow(BadRequestException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('refuses a separation date before the hire date', async () => {
    await expect(service.setSeparation(1, '2025-12-31', 7)).rejects.toThrow(BadRequestException);
  });

  describe('rates after a finalized run', () => {
    beforeEach(() => {
      prisma.payslip.findFirst.mockResolvedValue({ run: { periodEnd: at('2026-09-15') } });
    });

    it('refuses a new rate dated inside the finalized range', async () => {
      await expect(service.addRate(1, { dailyRate: 650, effectiveOn: '2026-09-10' }, 7)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.employeeRate.create).not.toHaveBeenCalled();
    });

    it('accepts a new rate dated after it', async () => {
      await service.addRate(1, { dailyRate: 650, effectiveOn: '2026-09-16' }, 7);
      expect(prisma.employeeRate.create).toHaveBeenCalledWith({
        data: { employeeId: 1, dailyRate: 650, effectiveOn: at('2026-09-16'), createdById: 7 },
      });
    });

    it('refuses to remove a rate a finalized run may have used', async () => {
      prisma.employeeRate.findFirst.mockResolvedValue({ id: 5, employeeId: 1, effectiveOn: at('2026-01-05'), deletedAt: null });
      await expect(service.removeRate(1, 5, 7)).rejects.toThrow(ConflictException);
    });

    it('soft-deletes a rate dated after the finalized range', async () => {
      await service.removeRate(1, 9, 7);
      expect(prisma.employeeRate.update.mock.calls[0][0]).toMatchObject({
        where: { id: 9 },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
