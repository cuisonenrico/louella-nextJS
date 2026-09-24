import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeeAccountsService } from './employee-accounts.service';

describe('EmployeeAccountsService', () => {
  let prisma: Record<string, any>;
  let users: Record<string, jest.Mock>;
  let employees: { requireEmployee: jest.Mock };
  let service: EmployeeAccountsService;

  beforeEach(() => {
    prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      auditEvent: { createMany: jest.fn() },
    };
    users = {
      createByAdmin: jest.fn().mockResolvedValue({ id: 40, email: 'ana@louella.ph', role: 'MANAGER', isActive: true }),
      findByIdSafe: jest.fn().mockResolvedValue({ id: 41, email: 'old@louella.ph', role: 'VIEWER', isActive: true }),
      setActive: jest.fn().mockResolvedValue({}),
    };
    employees = { requireEmployee: jest.fn().mockResolvedValue({ id: 1, userId: null, user: null }) };
    service = new EmployeeAccountsService(prisma as never, users as never, employees as never);
  });

  it('creates a login that must change its password, and links it', async () => {
    const account = await service.create(1, { email: 'ana@louella.ph', password: 'temporary1', role: 'MANAGER', branchId: 3 }, 7);
    expect(users.createByAdmin).toHaveBeenCalledWith(
      { email: 'ana@louella.ph', password: 'temporary1', role: 'MANAGER', branchId: 3, mustChangePassword: true },
      7,
    );
    expect(prisma.employee.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { userId: 40 } });
    expect(account).toEqual({ userId: 40, email: 'ana@louella.ph', role: 'MANAGER', isActive: true });
  });

  it('refuses a second login for the same employee', async () => {
    employees.requireEmployee.mockResolvedValue({ id: 1, userId: 40, user: { id: 40 } });
    await expect(service.create(1, { email: 'x@y.z', password: 'temporary1', role: 'VIEWER' }, 7)).rejects.toThrow(ConflictException);
    expect(users.createByAdmin).not.toHaveBeenCalled();
  });

  it('links an existing login that no other employee holds', async () => {
    await service.link(1, 41, 7);
    expect(prisma.employee.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { userId: 41 } });
  });

  it('refuses a login already linked elsewhere', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 2, firstName: 'Ben', lastName: 'Reyes' });
    await expect(service.link(1, 41, 7)).rejects.toThrow(ConflictException);
  });

  it('refuses a login that does not exist', async () => {
    users.findByIdSafe.mockResolvedValue(null);
    await expect(service.link(1, 99, 7)).rejects.toThrow(NotFoundException);
  });

  it('deactivates the login but keeps the link', async () => {
    employees.requireEmployee.mockResolvedValue({ id: 1, userId: 40, user: { id: 40, email: 'ana@louella.ph', role: 'MANAGER' } });
    await service.deactivate(1, 7);
    expect(users.setActive).toHaveBeenCalledWith(40, false, 7);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('has nothing to deactivate without a login', async () => {
    await expect(service.deactivate(1, 7)).rejects.toThrow(BadRequestException);
  });
});
