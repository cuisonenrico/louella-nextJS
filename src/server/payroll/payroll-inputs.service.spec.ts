import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PayrollInputsService } from './payroll-inputs.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe('PayrollInputsService', () => {
  let prisma: Record<string, any>;
  let service: PayrollInputsService;

  const bonus = {
    employeeId: 1,
    periodStart: '2026-09-01',
    kind: 'ADDITION' as const,
    category: 'BONUS' as const,
    description: 'Mid-year bonus',
    amount: 1000,
  };

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 1, hiredOn: at('2026-01-05'), separatedOn: null }) },
      payrollAdjustment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 5, periodStart: at('2026-09-01'), deletedAt: null }),
        create: jest.fn().mockResolvedValue({ id: 5, employeeId: 1, periodStart: at('2026-09-01'), kind: 'ADDITION', category: 'BONUS', description: 'Mid-year bonus', amount: 1000 }),
        update: jest.fn().mockResolvedValue({ id: 5 }),
      },
      recurringDeduction: { findFirst: jest.fn().mockResolvedValue({ id: 31, employeeId: 1 }) },
      recurringDeductionSkip: {
        findFirst: jest.fn().mockResolvedValue({ id: 77, periodStart: at('2026-09-01'), deletedAt: null }),
        create: jest.fn().mockResolvedValue({ id: 77 }),
        update: jest.fn().mockResolvedValue({ id: 77 }),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new PayrollInputsService(prisma as never);
  });

  it('adds a one-off item to an open cutoff', async () => {
    const view = await service.createAdjustment(bonus, 7);
    expect(prisma.payrollAdjustment.create).toHaveBeenCalledWith({
      data: { ...bonus, periodStart: at('2026-09-01'), description: 'Mid-year bonus', createdById: 7 },
    });
    expect(view).toMatchObject({ id: 5, periodStart: '2026-09-01', amount: 1000 });
  });

  it('refuses a finalized cutoff', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ id: 9 });
    await expect(service.createAdjustment(bonus, 7)).rejects.toThrow(ConflictException);
  });

  it('refuses a category that does not fit the kind', async () => {
    await expect(service.createAdjustment({ ...bonus, category: 'OFFENSE' }, 7)).rejects.toThrow(BadRequestException);
    await expect(
      service.createAdjustment({ ...bonus, kind: 'DEDUCTION', category: 'OVERTIME' }, 7),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses an employee not employed during the cutoff', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 1, hiredOn: at('2026-09-20'), separatedOn: null });
    await expect(service.createAdjustment(bonus, 7)).rejects.toThrow(BadRequestException);
  });

  it('refuses to remove an item from a finalized cutoff', async () => {
    prisma.payrollRun.findFirst.mockResolvedValue({ id: 9 });
    await expect(service.removeAdjustment(5, 7)).rejects.toThrow(ConflictException);
    expect(prisma.payrollAdjustment.update).not.toHaveBeenCalled();
  });

  it('skips a recurring deduction only on the 1–15 cutoff', async () => {
    await expect(service.createSkip('2026-09-16', { employeeId: 1, recurringDeductionId: 31 }, 7)).rejects.toThrow(
      BadRequestException,
    );
    await service.createSkip('2026-09-01', { employeeId: 1, recurringDeductionId: 31 }, 7);
    expect(prisma.recurringDeductionSkip.create).toHaveBeenCalledWith({
      data: { employeeId: 1, recurringDeductionId: 31, periodStart: at('2026-09-01'), createdById: 7 },
    });
  });

  it('refuses to skip another employee’s deduction', async () => {
    prisma.recurringDeduction.findFirst.mockResolvedValue(null);
    await expect(service.createSkip('2026-09-01', { employeeId: 2, recurringDeductionId: 31 }, 7)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('undoes a skip while the cutoff is open', async () => {
    await service.removeSkip(77, 7);
    expect(prisma.recurringDeductionSkip.update.mock.calls[0][0]).toMatchObject({
      where: { id: 77 },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
