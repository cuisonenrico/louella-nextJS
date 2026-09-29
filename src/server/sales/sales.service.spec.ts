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

describe('SalesService — exact money', () => {
  it('adds sales in centavos: ten ₱0.10 sales total exactly ₱1.00', async () => {
    const prisma = makePrisma();
    prisma.inventory.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        date: new Date('2026-09-01T00:00:00Z'),
        branch: { id: 1, name: 'Main' },
        product: { id: i + 1, name: `Candy ${i}`, type: 'MISCELLANEOUS', price: 0.1 },
        quantity: 1,
        delivery: 0,
        leftover: 0,
        reject: 0,
        adjustments: [],
        notes: null,
      })),
    );
    const service = new SalesService(prisma as never);

    const result = await service.getByBranchAndDate(1, '2026-09-01');

    expect(result.totals.totalSales).toBe(1);
    expect(result.breakdown.every((r) => r.sales === 0.1)).toBe(true);
  });
});

describe('SalesService — counted days', () => {
  const inv = (id: number, branchId: number, countedAt: Date | null) => ({
    id,
    date: new Date('2026-09-01T00:00:00Z'),
    branch: { id: branchId, name: `B${branchId}` },
    product: { id: 1, name: 'Pandesal', type: 'BREAD', price: 5 },
    quantity: 10,
    delivery: 0,
    leftover: countedAt ? 4 : 10,
    reject: 0,
    leftoverCountedAt: countedAt,
    adjustments: [],
    notes: null,
  });

  it('marks a row settled only once its leftover is counted', async () => {
    const prisma = makePrisma();
    prisma.inventory.findMany.mockResolvedValue([inv(1, 1, new Date()), inv(2, 1, null)]);
    const result = await new SalesService(prisma as never).getByBranchAndDate(1, '2026-09-01');

    expect(result.breakdown.map((r) => [r.sold, r.settled])).toEqual([[6, true], [0, false]]);
    expect(result.totals).toMatchObject({ totalSales: 30, settledDays: 1, unsettledDays: 1 });
  });

  it('summarises several branches from one read', async () => {
    const prisma = makePrisma();
    prisma.inventory.findMany.mockResolvedValue([inv(1, 1, new Date()), inv(2, 2, new Date())]);
    const summaries = await new SalesService(prisma as never).getDailySummaries([1, 2, 3], '2026-09-01', '2026-09-01');

    expect(prisma.inventory.findMany).toHaveBeenCalledTimes(1);
    expect(summaries.map((s) => [s.branchId, s.totals.totalSales])).toEqual([[1, 30], [2, 30], [3, 0]]);
  });
});
