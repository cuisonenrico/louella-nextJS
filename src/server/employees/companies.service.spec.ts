import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CompaniesService } from './companies.service';

const row = (o: Record<string, unknown> = {}) => ({ id: 1, name: 'Louella Bakeshop Inc.', isActive: true, ...o });

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
}

describe('CompaniesService', () => {
  let prisma: Record<string, any>;
  let service: CompaniesService;

  beforeEach(() => {
    prisma = {
      company: {
        findMany: jest.fn().mockResolvedValue([row()]),
        findUnique: jest.fn().mockResolvedValue(row()),
        create: jest.fn().mockResolvedValue(row()),
        update: jest.fn().mockResolvedValue(row({ name: 'Renamed' })),
      },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    service = new CompaniesService(prisma as never);
  });

  it('lists active companies by name unless inactive ones are asked for', async () => {
    await service.list(false);
    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    );
    await service.list(true);
    expect(prisma.company.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('creates with a trimmed name and records it', async () => {
    await service.create('  Louella Bakeshop Inc.  ', 7);
    expect(prisma.company.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Louella Bakeshop Inc.' } }),
    );
    expect(prisma.auditEvent.createMany).toHaveBeenCalled();
  });

  it('refuses a duplicate name with 409', async () => {
    prisma.company.create.mockRejectedValue(uniqueViolation());
    await expect(service.create('Louella Bakeshop Inc.', 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses a rename onto an existing name with 409', async () => {
    prisma.company.update.mockRejectedValue(uniqueViolation());
    await expect(service.update(1, { name: 'Taken' }, 7)).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s an unknown company', async () => {
    prisma.company.findUnique.mockResolvedValue(null);
    await expect(service.update(99, { isActive: false }, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retires instead of deleting', async () => {
    await service.update(1, { isActive: false }, 7);
    expect(prisma.company.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { name: undefined, isActive: false } }),
    );
  });
});
