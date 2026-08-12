import { Test } from '@nestjs/testing';
import { AutofillOnDemandService } from './autofill-on-demand.service';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * This runs on a read path that every inventory, production, and material
 * sheet load passes through, so the properties that matter are: it must be
 * nearly free when there is nothing to do, it must not run twice at once, it
 * must not attempt an unbounded catch-up, and it must never throw.
 */
describe('AutofillOnDemandService', () => {
  const TODAY = '2026-08-02';

  let service: AutofillOnDemandService;
  let prisma: {
    inventory: { findFirst: jest.Mock };
    materialInventory: { findFirst: jest.Mock };
  };
  let jobs: {
    autofillMissingEntries: jest.Mock;
    autofillDateRange: jest.Mock;
    autofillMaterialStock: jest.Mock;
    autofillMaterialStockRange: jest.Mock;
  };

  /** Freezes "now" at midday Manila on TODAY so date maths is deterministic. */
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-02T04:00:00.000Z'));
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(async () => {
    prisma = {
      inventory: { findFirst: jest.fn() },
      materialInventory: { findFirst: jest.fn() },
    };
    jobs = {
      autofillMissingEntries: jest.fn().mockResolvedValue({}),
      autofillDateRange: jest.fn().mockResolvedValue({}),
      autofillMaterialStock: jest.fn().mockResolvedValue({}),
      autofillMaterialStockRange: jest.fn().mockResolvedValue({}),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AutofillOnDemandService,
        { provide: PrismaService, useValue: prisma },
        { provide: JobsService, useValue: jobs },
      ],
    }).compile();

    service = moduleRef.get(AutofillOnDemandService);
  });

  const lastInventoryDate = (iso: string | null) =>
    prisma.inventory.findFirst.mockResolvedValue(
      iso === null ? null : { date: new Date(`${iso}T00:00:00.000Z`) },
    );

  it('does no work when today is already filled', async () => {
    lastInventoryDate(TODAY);

    await service.ensure('inventory');

    expect(jobs.autofillMissingEntries).not.toHaveBeenCalled();
    expect(jobs.autofillDateRange).not.toHaveBeenCalled();
  });

  it('skips even the lookup on a repeat call, so page loads stay cheap', async () => {
    lastInventoryDate(TODAY);

    await service.ensure('inventory');
    await service.ensure('inventory');
    await service.ensure('inventory');

    expect(prisma.inventory.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fills only today when yesterday was the last filled date', async () => {
    lastInventoryDate('2026-08-01');

    await service.ensure('inventory');

    expect(jobs.autofillMissingEntries).toHaveBeenCalledWith(TODAY, 'auto');
    expect(jobs.autofillDateRange).not.toHaveBeenCalled();
  });

  it('fills the whole gap as a range when several days were missed', async () => {
    lastInventoryDate('2026-07-30');

    await service.ensure('inventory');

    expect(jobs.autofillDateRange).toHaveBeenCalledWith('2026-07-31', TODAY, 'auto');
  });

  it('caps catch-up so one page load cannot trigger months of backfill', async () => {
    // A year-old gap: the underlying range job would happily attempt all of it
    // and blow the function timeout.
    lastInventoryDate('2025-08-02');

    await service.ensure('inventory');

    expect(jobs.autofillDateRange).toHaveBeenCalledWith('2026-07-26', TODAY, 'auto');
  });

  it('fills today when the table is empty', async () => {
    lastInventoryDate(null);

    await service.ensure('inventory');

    expect(jobs.autofillMissingEntries).toHaveBeenCalledWith(TODAY, 'auto');
  });

  it('runs one fill when concurrent requests arrive together', async () => {
    lastInventoryDate('2026-08-01');

    await Promise.all([
      service.ensure('inventory'),
      service.ensure('inventory'),
      service.ensure('inventory'),
    ]);

    expect(jobs.autofillMissingEntries).toHaveBeenCalledTimes(1);
  });

  it('never throws when the fill fails — the page must still render', async () => {
    lastInventoryDate('2026-08-01');
    jobs.autofillMissingEntries.mockRejectedValue(new Error('db down'));

    await expect(service.ensure('inventory')).resolves.toBeUndefined();
  });

  it('never throws when the lookup itself fails', async () => {
    prisma.inventory.findFirst.mockRejectedValue(new Error('db down'));

    await expect(service.ensure('inventory')).resolves.toBeUndefined();
  });

  it('retries after a failure instead of caching the bad outcome', async () => {
    prisma.inventory.findFirst.mockRejectedValueOnce(new Error('db down'));
    await service.ensure('inventory');

    lastInventoryDate(TODAY);
    await service.ensure('inventory');

    expect(prisma.inventory.findFirst).toHaveBeenCalledTimes(2);
  });

  it('routes the materials scope to the material jobs', async () => {
    prisma.materialInventory.findFirst.mockResolvedValue({
      date: new Date('2026-08-01T00:00:00.000Z'),
    });

    await service.ensure('materials');

    expect(jobs.autofillMaterialStock).toHaveBeenCalledWith(TODAY, 'auto');
    expect(jobs.autofillMissingEntries).not.toHaveBeenCalled();
  });

  it('tracks scopes independently', async () => {
    lastInventoryDate(TODAY);
    prisma.materialInventory.findFirst.mockResolvedValue(null);

    await service.ensure('inventory');
    await service.ensure('materials');

    expect(jobs.autofillMissingEntries).not.toHaveBeenCalled();
    expect(jobs.autofillMaterialStock).toHaveBeenCalledWith(TODAY, 'auto');
  });
});
