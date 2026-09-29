import { InventoryService } from './inventory.service';

/** The read-only reports, on a mocked client: what they count and what they skip. */
describe('InventoryService — reports', () => {
  const noCache = { wrap: (_ns: string, _key: unknown[], fn: () => unknown) => fn() };
  const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

  function service(prisma: Record<string, unknown>) {
    return new InventoryService(prisma as never, noCache as never);
  }

  it('rates rejects against opening stock plus deliveries, taking each opening once', async () => {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: 7, name: 'Ensaymada', type: 'BREAD' }]) },
      inventory: {
        findMany: jest.fn().mockResolvedValue([
          // Branch 1: opens on 20 carried over, no delivery, rejects 5 of it.
          { branchId: 1, productId: 7, quantity: 20, delivery: 0, reject: 5 },
          { branchId: 1, productId: 7, quantity: 15, delivery: 0, reject: 0 },
          // Branch 2: 10 delivered, 0 opening.
          { branchId: 2, productId: 7, quantity: 0, delivery: 10, reject: 0 },
        ]),
      },
    };

    const [row] = await service(prisma).getRejectionByProduct(null, '2026-09-01', '2026-09-02');

    // Used to read 5 / 10 delivered = 50%; the second day's opening (15, the
    // same unsold bread) must not be counted again.
    expect(row).toMatchObject({ totalDelivery: 10, totalSupply: 30, totalReject: 5 });
    expect(row.rejectRate).toBeCloseTo((5 / 30) * 100);
  });

  it('does not report a product missing before its launch day', async () => {
    const prisma = {
      branch: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'Main' }]) },
      product: {
        findMany: jest.fn().mockResolvedValue([{ id: 7, name: 'New bun', date: new Date('2026-09-02T03:00:00Z') }]),
      },
      inventory: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const { missing } = await service(prisma).getGaps(1, '2026-09-01', '2026-09-03');

    expect(missing.map((m) => m.date)).toEqual(['2026-09-02', '2026-09-03']);
  });

  it('counts uncounted rows and keeps them out of zero sales', async () => {
    const row = (productId: number, leftover: number, counted: boolean) => ({
      branchId: 1,
      productId,
      date: at('2026-09-01'),
      quantity: 10,
      delivery: 0,
      leftover,
      reject: 0,
      leftoverCountedAt: counted ? new Date() : null,
      adjustments: [],
      product: { id: productId, type: 'BREAD', price: 5, name: `P${productId}` },
    });
    const prisma = {
      inventory: {
        findMany: jest.fn().mockResolvedValue([
          row(1, 10, true), // counted, nothing sold: a real zero seller
          row(2, 10, false), // nobody counted yet
        ]),
      },
      productPriceHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const summary = await service(prisma).getSummary(1, '2026-09-01', '2026-09-01');

    expect(summary.uncountedRows).toBe(1);
    expect(summary.zeroSales.map((z) => z.productId)).toEqual([1]);
  });
});
