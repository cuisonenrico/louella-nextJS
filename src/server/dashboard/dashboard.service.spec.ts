import { FEATURE_BY_KEY } from '@/lib/rbac/features';
import { DashboardService } from './dashboard.service';

/**
 * Pass-through cache: these tests assert what the summary computes, not what
 * it caches. `wrap` therefore always calls straight through to the source.
 */
function makeCache() {
  return {
    wrap: jest.fn(
      (_ns: string, _key: (string | number)[], compute: () => Promise<unknown>) =>
        compute(),
    ),
    bump: jest.fn(),
  };
}

/**
 * A Prisma double returning one row of everything the summary aggregates.
 *
 * Values are non-empty on purpose: a stripping bug that returns `[]` instead of
 * omitting a field would still look "absent" against empty fixtures.
 */
function makePrisma(inventoryRows: { branchId: number }[] = []) {
  return {
    product: {
      count: jest.fn().mockResolvedValue(4),
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: 'Pandesal', type: 'BREAD', price: { toNumber: () => 12.5 }, isActive: true },
      ]),
    },
    branch: {
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([
        { id: 1, name: 'Main', address: null, isActive: true },
        { id: 2, name: 'Annex', address: null, isActive: true },
      ]),
    },
    material: {
      count: jest.fn().mockResolvedValue(7),
      findMany: jest.fn().mockResolvedValue([]),
    },
    recipe: { count: jest.fn().mockResolvedValue(2) },
    production: {
      findMany: jest.fn().mockResolvedValue([{ yield: 100, product: { type: 'BREAD' } }]),
    },
    materialInventory: {
      groupBy: jest.fn().mockResolvedValue([]),
      findMany: jest.fn().mockResolvedValue([]),
    },
    inventory: { findMany: jest.fn().mockResolvedValue(inventoryRows) },
  } as never;
}

const ALL_PANELS = (FEATURE_BY_KEY.get('dashboard')!.panels ?? []).map(
  (p) => `dashboard:${p.id}`,
);

describe('DashboardService.getSummary', () => {
  it('covers every panel the manifest declares', () => {
    // If a panel is added to the manifest and not handled here, the suite below
    // silently stops testing it.
    expect(ALL_PANELS.sort()).toEqual(
      [
        'dashboard:branch-gaps',
        'dashboard:branch-orders',
        'dashboard:kpis',
        'dashboard:low-stock',
        'dashboard:production-mix',
        'dashboard:rejections',
        'dashboard:revenue-trend',
      ].sort(),
    );
  });

  it('returns the panels a caller holds', async () => {
    const service = new DashboardService(makePrisma() as never, makeCache() as never);
    const result = await service.getSummary('2026-09-02', undefined, ALL_PANELS);

    expect(result.stats).toBeDefined();
    expect(result.production).toBeDefined();
    expect(result.branchGaps).toBeDefined();
  });

  /**
   * The point of `sensitive`: a denied panel's data must not reach the browser.
   * Hiding it client-side would leave the numbers in the network response, so
   * these assert omission from the payload itself.
   */
  describe('withholds a denied panel entirely', () => {
    it('omits the KPI figures without dashboard:kpis', async () => {
      const service = new DashboardService(makePrisma() as never, makeCache() as never);
      const result = await service.getSummary('2026-09-02', undefined, ['dashboard']);

      expect(result.stats).toBeUndefined();
      expect(result.products).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain('12.5');
    });

    it('omits the production mix without dashboard:production-mix', async () => {
      const service = new DashboardService(makePrisma() as never, makeCache() as never);
      const result = await service.getSummary('2026-09-02', undefined, ['dashboard:kpis']);

      expect(result.production).toBeUndefined();
    });

    it('omits low stock without dashboard:low-stock', async () => {
      const service = new DashboardService(makePrisma() as never, makeCache() as never);
      const result = await service.getSummary('2026-09-02', undefined, ['dashboard:kpis']);

      expect(result.lowStock).toBeUndefined();
    });

    it('omits the branch roster and gaps without dashboard:branch-gaps', async () => {
      const service = new DashboardService(makePrisma() as never, makeCache() as never);
      const result = await service.getSummary('2026-09-02', undefined, ['dashboard:kpis']);

      expect(result.branches).toBeUndefined();
      expect(result.branchGaps).toBeUndefined();
      // The roster is the leak this closed: no branch name may appear at all.
      expect(JSON.stringify(result)).not.toContain('Annex');
    });
  });

  describe('branch gaps', () => {
    it('lists active branches with no entry for the date', async () => {
      // Branch 1 entered, branch 2 did not.
      const service = new DashboardService(makePrisma([{ branchId: 1 }]) as never, makeCache() as never);
      const result = await service.getSummary('2026-09-02', undefined, [
        'dashboard',
        'dashboard:branch-gaps',
      ]);

      expect(result.branchGaps?.map((b) => b.name)).toEqual(['Annex']);
    });

    it('cannot name another branch when the caller is scoped', async () => {
      // A scoped caller arrives with BranchGuard's injected branchId. The branch
      // query is narrowed by it, so the roster this builds from can only ever
      // contain their own branch — the cross-branch leak is impossible rather
      // than merely filtered afterwards.
      const prisma = makePrisma([]);
      const service = new DashboardService(prisma, makeCache() as never);
      await service.getSummary('2026-09-02', 1, ['dashboard', 'dashboard:branch-gaps']);

      const branchQuery = (prisma as unknown as {
        branch: { findMany: jest.Mock };
      }).branch.findMany.mock.calls[0][0];
      expect(branchQuery.where).toMatchObject({ id: 1 });
    });
  });

  it('ships the roster for the rejections filter too', async () => {
    // The wastage card's branch filter needs the roster, so it travels with
    // either panel — still narrowed to the caller's scope.
    const service = new DashboardService(makePrisma() as never, makeCache() as never);
    const result = await service.getSummary('2026-09-02', undefined, [
      'dashboard',
      'dashboard:rejections',
    ]);

    expect(result.branches).toBeDefined();
    expect(result.branchGaps).toBeUndefined();
  });
});
