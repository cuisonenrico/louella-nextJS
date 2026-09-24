import { diffFields, recordChanges } from './audit.util';
import { FakeStockDb, day } from '../testing/fake-stock-db';
import { InventoryService } from '../../inventory/inventory.service';
import { ProductionService } from '../../production/production.service';

describe('diffFields', () => {
  it('lists only the audited fields that changed, as [before, after]', () => {
    expect(
      diffFields(
        'Inventory',
        { quantity: 10, leftover: 5, notes: null, updatedAt: new Date(1) },
        { quantity: 10, leftover: 3, notes: 'recount', updatedAt: new Date(2) },
      ),
    ).toEqual({ leftover: [5, 3], notes: [null, 'recount'] });
  });

  it('records a creation as null → value', () => {
    expect(diffFields('Production', null, { yield: 40, notes: null })).toEqual({
      yield: [null, 40],
    });
  });

  it('compares dates and decimals by value', () => {
    expect(
      diffFields('Production', { date: new Date('2026-09-01') }, { date: new Date('2026-09-01') }),
    ).toEqual({});
  });
});

describe('recordChanges', () => {
  it('skips an edit that changed nothing audited', async () => {
    const tx = { auditEvent: { createMany: jest.fn() } };

    await recordChanges(
      tx as never,
      [{ entity: 'Inventory', entityId: 1, before: { leftover: 5 }, after: { leftover: 5 } }],
      7,
    );

    expect(tx.auditEvent.createMany).not.toHaveBeenCalled();
  });
});

/** "Who changed this count, and from what?" — answered on real writes. */
describe('change history on stock writes', () => {
  let db: FakeStockDb & { recipeVersion: { findMany: jest.Mock }; unitConversion: { findMany: jest.Mock } };

  beforeEach(() => {
    db = Object.assign(new FakeStockDb(), {
      recipeVersion: { findMany: jest.fn().mockResolvedValue([]) },
      unitConversion: { findMany: jest.fn().mockResolvedValue([]) },
    });
  });
  const events = (entity: string, entityId?: number) =>
    db.tables.auditEvent.filter(
      (e) => e.entity === entity && (entityId == null || e.entityId === entityId),
    );

  it('records a corrected count with who made it, and the carry-forward it caused', async () => {
    const service = new InventoryService(db as never, {} as never);
    const mon = db.seed('inventory', { branchId: 1, productId: 7, date: day('2026-09-14'), quantity: 10, delivery: 50, leftover: 20 });
    const tue = db.seed('inventory', { branchId: 1, productId: 7, date: day('2026-09-15'), quantity: 20, delivery: 40, leftover: 15 });

    await service.update(mon.id, { leftover: 18 }, undefined, 42);

    expect(events('Inventory', mon.id)).toEqual([
      expect.objectContaining({ action: 'update', changes: { leftover: [20, 18] }, userId: 42 }),
    ]);
    // Tuesday's opening moved because of Monday's correction, by the same user.
    expect(events('Inventory', tue.id)).toEqual([
      expect.objectContaining({ action: 'carry-forward', changes: { quantity: [20, 18] }, userId: 42 }),
    ]);
  });

  it('records nothing when the history write would disagree: it rolls back with the edit', async () => {
    const service = new InventoryService(db as never, {} as never);
    const mon = db.seed('inventory', { branchId: 1, productId: 7, date: day('2026-09-14'), quantity: 10, delivery: 5, leftover: 2 });

    await expect(service.update(mon.id, { leftover: 500 })).rejects.toThrow();

    expect(db.tables.auditEvent).toHaveLength(0);
  });

  it('keeps a deleted production row, records the delete, and restores it on re-entry', async () => {
    const service = new ProductionService(db as never, {} as never);
    const [row] = await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 10 }], 5);

    await service.remove(row.id, undefined, 5);
    expect(db.tables.production.find((r) => r.id === row.id)!.deletedAt).not.toBeNull();
    expect(await service.findAll()).toEqual(expect.objectContaining({ total: 0 }));

    await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 7 }], 5);

    expect(events('Production', row.id).map((e) => [e.action, e.changes])).toEqual([
      ['create', { branchId: [null, 1], productId: [null, 2], date: [null, '2026-09-08T00:00:00.000Z'], yield: [null, 10] }],
      ['delete', { branchId: [1, null], productId: [2, null], date: ['2026-09-08T00:00:00.000Z', null], yield: [10, null] }],
      ['restore', { branchId: [null, 1], productId: [null, 2], date: [null, '2026-09-08T00:00:00.000Z'], yield: [null, 7] }],
    ]);
    expect(db.live('production')).toEqual([expect.objectContaining({ id: row.id, yield: 7 })]);
  });

  it('records the material a production save consumed, against the stock card', async () => {
    const flour = { id: 3, name: 'Flour', unit: 'KG' };
    db.recipeVersion.findMany.mockResolvedValue([
      { version: 1, effectiveFrom: day('2026-01-01'), retired: false, recipeYield: 1,
        recipe: { productId: 2 }, items: [{ materialId: 3, quantity: 2, unit: 'KG', material: flour }] },
    ]);
    const card = db.seed('materialInventory', { materialId: 3, date: day('2026-09-08'), quantity: 100 });
    const service = new ProductionService(db as never, {} as never);

    await service.upsertBulk([{ productId: 2, date: '2026-09-08', yield: 10 }], 9);

    expect(events('MaterialInventory', card.id)).toEqual([
      expect.objectContaining({ action: 'update', changes: { used: [0, 20] }, userId: 9 }),
    ]);
  });
});
describe('payroll entities', () => {
  it('compares array fields by value, not by reference', () => {
    expect(diffFields('Employee', { restDays: [0] }, { restDays: [0] })).toEqual({});
    expect(diffFields('Employee', { restDays: [0] }, { restDays: [0, 3] })).toEqual({
      restDays: [[0], [0, 3]],
    });
  });
});
