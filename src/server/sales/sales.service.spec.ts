import { Test, TestingModule } from '@nestjs/testing';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';

function makePrisma() {
  return {
    inventory: { findMany: jest.fn().mockResolvedValue([]) },
    productPriceHistory: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('SalesService — soft-deleted inventory must be excluded', () => {
  let service: SalesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SalesService);
  });

  const expectsDeletedAtNull = () =>
    expect(prisma.inventory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );

  it('getByBranchAndDate filters out soft-deleted rows', async () => {
    await service.getByBranchAndDate(1, '2026-01-01');
    expectsDeletedAtNull();
  });

  it('getByBranch filters out soft-deleted rows', async () => {
    await service.getByBranch(1, '2026-01-01', '2026-01-31');
    expectsDeletedAtNull();
  });

  it('getByBranchAndProduct filters out soft-deleted rows', async () => {
    await service.getByBranchAndProduct(1, 2, '2026-01-01', '2026-01-31');
    expectsDeletedAtNull();
  });

  it('getByProduct filters out soft-deleted rows', async () => {
    await service.getByProduct(2, '2026-01-01', '2026-01-31');
    expectsDeletedAtNull();
  });

  it('getDailySummary filters out soft-deleted rows', async () => {
    await service.getDailySummary(1, '2026-01-01', '2026-01-31');
    expectsDeletedAtNull();
  });
});
