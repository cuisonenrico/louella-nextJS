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

describe('SalesService — bounded ranges', () => {
  let service: SalesService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new SalesService(prisma as never);
  });

  // These used to accept any span: one request could scan every row.
  it.each([
    ['getByBranch', (s: SalesService) => s.getByBranch(1, '2025-01-01', '2026-09-01')],
    ['getByBranchAndProduct', (s: SalesService) => s.getByBranchAndProduct(1, 2, '2025-01-01', '2026-09-01')],
    ['getByProduct', (s: SalesService) => s.getByProduct(2, '2025-01-01', '2026-09-01')],
    ['getDailySummary', (s: SalesService) => s.getDailySummary(1, '2025-01-01', '2026-09-01')],
  ])('%s refuses a range over 90 days', async (_name, call) => {
    await expect(call(service)).rejects.toThrow('Date range cannot exceed 90 days');
    expect(prisma.inventory.findMany).not.toHaveBeenCalled();
  });

  it('reads dates as Manila calendar days', async () => {
    await service.getByBranch(1, '2026-09-01', '2026-09-30');

    expect(prisma.inventory.findMany.mock.calls[0][0].where.date).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lte: new Date('2026-09-30T00:00:00.000Z'),
    });
  });
});
