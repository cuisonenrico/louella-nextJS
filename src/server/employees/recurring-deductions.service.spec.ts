import { NotFoundException } from '@nestjs/common';
import { RecurringDeductionsService } from './recurring-deductions.service';

describe('RecurringDeductionsService', () => {
  let prisma: Record<string, any>;
  let employees: { requireEmployee: jest.Mock };
  let service: RecurringDeductionsService;

  beforeEach(() => {
    prisma = {
      recurringDeduction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 31, employeeId: 1, name: 'SSS', employeeShare: 450, employerShare: 950, isActive: true }),
        create: jest.fn().mockResolvedValue({ id: 31, name: 'SSS', employeeShare: 450, employerShare: 950, isActive: true }),
        update: jest.fn().mockResolvedValue({ id: 31, name: 'SSS', employeeShare: 450, employerShare: 950, isActive: false }),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    employees = { requireEmployee: jest.fn().mockResolvedValue({ id: 1 }) };
    service = new RecurringDeductionsService(prisma as never, employees as never);
  });

  it('stores monthly employee and employer shares, employer defaulting to zero', async () => {
    await service.create(1, { name: ' Pag-IBIG ', employeeShare: 200 }, 7);
    expect(prisma.recurringDeduction.create).toHaveBeenCalledWith({
      data: { employeeId: 1, name: 'Pag-IBIG', employeeShare: 200, employerShare: 0 },
    });
  });

  it('deactivates rather than deletes', async () => {
    const view = await service.update(1, 31, { isActive: false }, 7);
    expect(view.isActive).toBe(false);
    expect(prisma.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses a deduction that belongs to another employee', async () => {
    prisma.recurringDeduction.findFirst.mockResolvedValue(null);
    await expect(service.update(2, 31, { isActive: false }, 7)).rejects.toThrow(NotFoundException);
  });
});
