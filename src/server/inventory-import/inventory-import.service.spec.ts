import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { InventoryImportService } from './inventory-import.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma() {
  const prisma: Record<string, any> = {
    branch: { findFirst: jest.fn() },
    product: {
      findMany: jest.fn(),
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    productAlias: { findMany: jest.fn() },
    productPriceHistory: { findMany: jest.fn(), createMany: jest.fn() },
    inventory: { upsert: jest.fn(), groupBy: jest.fn() },
    importLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  // Supports both Prisma transaction forms: an array of promises, and an
  // interactive callback receiving a transactional client.
  prisma.$transaction = jest.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.resolve([]),
  );
  return prisma as ReturnType<typeof makePrismaShape>;
}

// Only for typing makePrisma's return; never called.
declare function makePrismaShape(): {
  branch: { findFirst: jest.Mock };
  product: { findMany: jest.Mock; create: jest.Mock; aggregate: jest.Mock };
  productAlias: { findMany: jest.Mock };
  productPriceHistory: { findMany: jest.Mock; createMany: jest.Mock };
  inventory: { upsert: jest.Mock; groupBy: jest.Mock };
  importLog: {
    findFirst: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
  };
  $transaction: jest.Mock;
};

// ---------------------------------------------------------------------------
// Workbook builder — mirrors the bakery template layout:
//   col A = product name, col C = delivery (__EMPTY_1),
//   col E = leftover (__EMPTY_3), col G = reject (the date column),
//   col J = "Yesterday LO" (__EMPTY_6), the day's opening stock.
//
// The optional 5th tuple element adds the "Yesterday LO" column. Real `Day (n)`
// tabs always carry it; the `Day 0` seed tab does not, so omitting it models a
// genuine sheet shape rather than a convenience.
// ---------------------------------------------------------------------------

type DataRow = [
  name: string,
  delivery: number,
  leftover: number,
  reject: number,
  yesterdayLo?: number,
  price?: number,
];

function buildSheet(dateHeader: string, rows: DataRow[]): unknown[][] {
  const withYlo = rows.some(([, , , , ylo]) => ylo !== undefined);
  const header = [
    'PRODUCTS',
    'PRICES',
    'DELIVERY',
    'TOTAL',
    'LEFTOVER',
    'TOTAL',
    'REJECT',
  ];
  if (withYlo) header.push('TOTAL', 'PCS SOLD Today', 'Yesterday LO');

  return [
    ['PAGE 1', null, null, null, null, 'DATE:', dateHeader],
    header,
    ...rows.map(([name, d, l, r, ylo, price]) => {
      const row: unknown[] = [name, String(price ?? 0), d, '0', l, '0', r];
      if (withYlo) row.push('0', '0', ylo ?? 0);
      return row;
    }),
  ];
}

function buildWorkbook(
  sheets: { name: string; dateHeader: string; rows: DataRow[] }[],
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(buildSheet(s.dateHeader, s.rows));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('InventoryImportService', () => {
  let service: InventoryImportService;
  let prisma: ReturnType<typeof makePrisma>;
  let catalog: { id: number; name: string; price: number }[];

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(InventoryImportService);

    // Default catalog used by most tests. Held as a live array so a product
    // created mid-import is visible when the service rebuilds its resolver —
    // the whole point of creating it.
    catalog = [
      { id: 1, name: 'Pandesal', price: 0 },
      { id: 2, name: 'Ensaymada Big', price: 0 },
    ];
    prisma.product.findMany.mockImplementation(() =>
      Promise.resolve([...catalog]),
    );
    prisma.productAlias.findMany.mockResolvedValue([]);
    prisma.productPriceHistory.findMany.mockResolvedValue([]);
    prisma.branch.findFirst.mockResolvedValue({ id: 7, name: 'Silang' });
    prisma.importLog.findFirst.mockResolvedValue(null);
    prisma.inventory.groupBy.mockResolvedValue([]);
    // $transaction keeps makePrisma's dual-form implementation.
    prisma.product.aggregate.mockResolvedValue({ _max: { sortOrder: 20 } });
    let nextProductId = 100;
    prisma.product.create.mockImplementation(({ data }: any) => {
      const created = { id: nextProductId++, ...data };
      catalog.push({
        id: created.id,
        name: created.name,
        price: created.price,
      });
      return Promise.resolve(created);
    });
    prisma.productPriceHistory.createMany.mockResolvedValue({ count: 0 });
  });

  // -------------------------------------------------------------------------
  // dryRunWorkbook
  // -------------------------------------------------------------------------

  describe('dryRunWorkbook', () => {
    it('reports per-sheet date, matched count, and distinct unmatched names', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [
            ['Pandesal', 10, 3, 1],
            ['Ensaymada Big', 5, 2, 0],
            ['Unknown Item', 4, 4, 0],
            ['Unknown Item', 1, 1, 0], // duplicate unmatched → counted once
          ],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.summary.totalSheets).toBe(1);
      expect(res.summary.totalMatched).toBe(2);
      expect(res.summary.totalUnmatched).toBe(1);
      expect(res.summary.datesDetected).toEqual(['2025-04-14']);
      expect(res.sheets[0]).toMatchObject({
        sheetName: 'Day (1)',
        date: '2025-04-14',
        matched: 2,
        unmatchedCount: 1,
        unmatched: ['Unknown Item'],
      });
    });

    describe('unknownProducts', () => {
      it('describes each unknown label with the price and type needed to create it', async () => {
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [
              ['Pandesal', 10, 3, 1],
              ['Choco Bar', 4, 4, 0, undefined, 45],
              ['PAGE 2', 0, 0, 0],
              ['Cheese Tart', 2, 1, 0, undefined, 60],
            ],
          },
        ]);

        const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

        expect(res.unknownProducts).toEqual([
          expect.objectContaining({
            label: 'Choco Bar',
            price: 45,
            page: 1,
            suggestedType: 'BREAD',
          }),
          expect.objectContaining({
            label: 'Cheese Tart',
            price: 60,
            page: 2,
            suggestedType: 'CAKE',
          }),
        ]);
      });

      it('reports one entry per label across sheets, not one per occurrence', async () => {
        const sheet = (name: string, dateHeader: string): {
          name: string;
          dateHeader: string;
          rows: DataRow[];
        } => ({
          name,
          dateHeader,
          rows: [
            ['Pandesal', 10, 3, 1],
            ['Choco Bar', 4, 4, 0, undefined, 45],
          ],
        });
        const buf = buildWorkbook([
          sheet('Day (1)', '4/14/26'),
          sheet('Day (2)', '4/15/26'),
          sheet('Day (3)', '4/16/26'),
        ]);

        const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

        expect(res.unknownProducts).toHaveLength(1);
        expect(res.unknownProducts[0]).toMatchObject({
          label: 'Choco Bar',
          occurrences: 3,
          firstSeen: '2026-04-14',
        });
      });

      it('treats a label seen at two prices as one product that was repriced', async () => {
        // A one-off order price (Pandesal Pack at 300) is a price change, not a
        // second SKU. The product takes the earliest price; the rest become
        // price-history rows, mirroring seed-product-price-history.sql.
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [['Choco Bar', 4, 4, 0, undefined, 45]],
          },
          {
            name: 'Day (2)',
            dateHeader: '4/15/26',
            rows: [['Choco Bar', 4, 4, 0, undefined, 300]],
          },
          {
            name: 'Day (3)',
            dateHeader: '4/16/26',
            rows: [['Choco Bar', 4, 4, 0, undefined, 45]],
          },
        ]);

        const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

        expect(res.unknownProducts).toHaveLength(1);
        expect(res.unknownProducts[0]).toMatchObject({
          label: 'Choco Bar',
          price: 45,
          priceChanges: [
            { price: 45, effectiveAt: '2026-04-14' },
            { price: 300, effectiveAt: '2026-04-15' },
            { price: 45, effectiveAt: '2026-04-16' },
          ],
        });
      });

      it('suggests MISCELLANEOUS for an unknown label inside the Bote: block', async () => {
        // The deposit block sits at the end of page 3, so page alone would
        // suggest SPECIAL. Every bottle deposit in the catalog is MISC.
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [
              ['Pandesal', 10, 3, 1],
              ['PAGE 3', 0, 0, 0],
              ['Bote:', 0, 0, 0],
              ['Sarsi', 2, 1, 0, undefined, 10],
            ],
          },
        ]);

        const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

        expect(res.unknownProducts).toEqual([
          expect.objectContaining({
            label: 'Sarsi',
            page: 3,
            suggestedType: 'MISCELLANEOUS',
          }),
        ]);
      });

      it('is empty when every label matches a product', async () => {
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [['Pandesal', 10, 3, 1]],
          },
        ]);

        const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

        expect(res.unknownProducts).toEqual([]);
      });

      it('excludes ignored equipment labels, which are never products', async () => {
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [
              ['Pandesal', 10, 3, 1],
              ['Freezer', 1, 1, 0],
            ],
          },
        ]);

        const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

        expect(res.unknownProducts).toEqual([]);
      });
    });

    it('ignores non-Day sheets (pricelist, Del Sheet, etc.)', async () => {
      const buf = buildWorkbook([
        {
          name: 'pricelist',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
        { name: 'Day 0', dateHeader: '4/13/25', rows: [['Pandesal', 1, 1, 1]] },
        {
          name: 'Summary',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.summary.totalSheets).toBe(1);
      expect(res.sheets[0].sheetName).toBe('Day 0');
    });

    it('flags a sheet whose date header cannot be determined', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: 'NO-DATE',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.sheets[0].error).toMatch(/Could not determine date/);
      expect(res.sheets[0].matched).toBe(0);
    });

    it('does not touch the database in branch-independent mode', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(prisma.branch.findFirst).not.toHaveBeenCalled();
      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
    });

    it('validates the branch and flags an already-imported file when branchId is given', async () => {
      prisma.importLog.findFirst.mockResolvedValue({
        id: 99,
        importedAt: new Date('2025-05-01T00:00:00Z'),
      });
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx', 7);

      expect(prisma.branch.findFirst).toHaveBeenCalled();
      expect(res.branch).toEqual({ id: 7, name: 'Silang' });
      expect(res.alreadyImported).toEqual({
        logId: 99,
        importedAt: '2025-05-01',
      });
    });

    it('flags a sheet whose date is implausibly old (unused template tab)', async () => {
      // Unused "Day (16)"/"Day (17)" tabs reference blank cells, which Excel
      // renders as 1/0/00 — the regex accepts it and it parses to 1999-12-31.
      const buf = buildWorkbook([
        {
          name: 'Day (16)',
          dateHeader: '1/0/00',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.sheets[0].error).toMatch(/implausible/i);
      expect(res.sheets[0].date).toBe('');
      expect(res.summary.datesDetected).toEqual([]);
    });

    it('flags an all-zero sheet so it will not overwrite existing data', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day 0',
          dateHeader: '4/28/26',
          rows: [
            ['Pandesal', 0, 0, 0],
            ['Ensaymada Big', 0, 0, 0],
          ],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.sheets[0].error).toMatch(/zero/i);
    });

    it('flags an ambiguous sheet with a blocking error, not just the ambiguous array, so preview cannot look clean', async () => {
      // importWorkbook aborts this whole sheet (see the importWorkbook suite
      // below); the preview must say so up front — an operator who sees no
      // error here and imports would otherwise learn the sheet was dropped
      // only after the fact.
      prisma.product.findMany.mockResolvedValue([
        { id: 119, name: 'Bonette', price: 30 },
        { id: 120, name: 'Bonette', price: 8 },
      ]);
      prisma.productAlias.findMany.mockResolvedValue([]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Bonette', 5, 2, 0]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.sheets[0].ambiguous).toHaveLength(1);
      expect(res.sheets[0].ambiguous[0]).toMatch(/Bonette/);
      expect(res.sheets[0].ambiguous[0]).toMatch(/matches none of the 2 product/);
      expect(res.sheets[0].error).toMatch(/skipped/i);
      expect(res.summary.totalAmbiguous).toBe(1);
    });

    it('treats "Expected Sales (Dapat Benta)" as a label, not an unmatched product', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [
            ['Pandesal', 1, 1, 1],
            ['Expected Sales (Dapat Benta)', 0, 0, 4142026],
          ],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(res.sheets[0].unmatched).toEqual([]);
      expect(res.sheets[0].matched).toBe(1);
    });

    it('reports existing rows for a sheet date, split into placeholders and real data', async () => {
      prisma.inventory.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-14T00:00:00.000Z'),
          isAutoGenerated: true,
          _count: { _all: 3 },
        },
        {
          date: new Date('2026-04-14T00:00:00.000Z'),
          isAutoGenerated: false,
          _count: { _all: 2 },
        },
      ]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx', 7);

      expect(res.sheets[0].existing).toEqual({ placeholders: 3, real: 2 });
    });

    it('does not query existing rows in branch-independent mode', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.dryRunWorkbook(buf, 'sheet.xlsx');

      expect(prisma.inventory.groupBy).not.toHaveBeenCalled();
      expect(res.sheets[0].existing).toBeUndefined();
    });

    it('throws NotFound when the supplied branch does not exist', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      await expect(
        service.dryRunWorkbook(buf, 'sheet.xlsx', 404),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // importWorkbook
  // -------------------------------------------------------------------------

  describe('importWorkbook', () => {
    it('rejects a missing branch before doing any work', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      await expect(
        service.importWorkbook(buf, 404, 'sheet.xlsx'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      expect(prisma.importLog.create).not.toHaveBeenCalled();
    });

    it('rejects an exact duplicate file for the branch', async () => {
      prisma.importLog.findFirst.mockResolvedValue({
        id: 12,
        importedAt: new Date('2025-05-01T00:00:00Z'),
      });
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      await expect(
        service.importWorkbook(buf, 7, 'sheet.xlsx'),
      ).rejects.toThrow(ConflictException);
    });

    it('upserts matched products and records unmatched names as row errors', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [
            ['Pandesal', 10, 3, 1],
            ['Ensaymada Big', 5, 2, 0],
            ['Unknown Item', 4, 4, 0],
          ],
        },
      ]);

      // "Unknown Item" is acknowledged: an unresolved unknown label now
      // refuses the whole import rather than being skipped silently.
      const res = await service.importWorkbook(
        buf,
        7,
        'sheet.xlsx',
        55,
        'skip',
        [],
        ['Unknown Item'],
      );

      // Two matched products upserted with the right counts.
      expect(prisma.inventory.upsert).toHaveBeenCalledTimes(2);
      const calls = prisma.inventory.upsert.mock.calls.map((c) => c[0]);
      const pandesal = calls.find(
        (c) => c.where.branchId_productId_date.productId === 1,
      );
      expect(pandesal.create).toMatchObject({
        branchId: 7,
        productId: 1,
        quantity: 0,
        delivery: 10,
        leftover: 3,
        reject: 1,
      });

      const sheet = res.sheets[0];
      expect(sheet.processed).toBe(2);
      expect(sheet.skipped).toBe(1);
      expect(sheet.errors).toContain('Product not found: "Unknown Item"');
      expect(res.summary.totalErrors).toBe(1);

      // ImportLog written with PARTIAL status because of the one error.
      expect(prisma.importLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: 7,
            status: 'PARTIAL',
            importedBy: 55,
          }),
        }),
      );
    });

    it('does not upsert a sheet whose date is implausibly old', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (16)',
          dateHeader: '1/0/00',
          rows: [['Pandesal', 1, 1, 1]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/implausible/i);
    });

    it('does not upsert an all-zero sheet (blank Day 0 carry-in tab)', async () => {
      // The second workbook's Day 0 is dated the same day as the previous
      // workbook's last real sheet; writing its zeros would wipe that data.
      const buf = buildWorkbook([
        {
          name: 'Day 0',
          dateHeader: '4/28/26',
          rows: [
            ['Pandesal', 0, 0, 0],
            ['Ensaymada Big', 0, 0, 0],
          ],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/zero/i);
    });

    it('skips a sheet whose date already has real data (default conflict mode)', async () => {
      prisma.inventory.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-14T00:00:00.000Z'),
          isAutoGenerated: false,
          _count: { _all: 42 },
        },
      ]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 10, 3, 1]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/existing data.*overwrite/i);
    });

    it('overwrites existing real data when conflictMode is "overwrite"', async () => {
      prisma.inventory.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-14T00:00:00.000Z'),
          isAutoGenerated: false,
          _count: { _all: 42 },
        },
      ]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 10, 3, 1]],
        },
      ]);

      const res = await service.importWorkbook(
        buf,
        7,
        'sheet.xlsx',
        undefined,
        'overwrite',
      );

      expect(prisma.inventory.upsert).toHaveBeenCalledTimes(1);
      expect(res.sheets[0].processed).toBe(1);
    });

    it('does not block on autofill placeholder rows and claims them on update', async () => {
      // Placeholders (isAutoGenerated: true) never block an import, but the
      // update must reset quantity and flip isAutoGenerated so the leftover
      // recascade cannot later clobber the imported values.
      prisma.inventory.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-14T00:00:00.000Z'),
          isAutoGenerated: true,
          _count: { _all: 160 },
        },
      ]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 10, 3, 1]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(res.sheets[0].processed).toBe(1);
      const call = prisma.inventory.upsert.mock.calls[0][0];
      expect(call.update).toMatchObject({
        delivery: 10,
        leftover: 3,
        reject: 1,
        quantity: 0,
        isAutoGenerated: false,
      });
    });

    it("carries the sheet's \"Yesterday LO\" into quantity so sold math balances", async () => {
      // The sheet computes PCS SOLD Today as
      //   Yesterday LO + delivery - leftover - reject,
      // which is exactly computeSold() with quantity = Yesterday LO. Dropping
      // the column understates every day's sales by the prior day's leftover.
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 144, 105, 24, 60]],
        },
      ]);

      await service.importWorkbook(buf, 7, 'sheet.xlsx');

      const call = prisma.inventory.upsert.mock.calls[0][0];
      expect(call.create).toMatchObject({
        productId: 1,
        quantity: 60,
        delivery: 144,
        leftover: 105,
        reject: 24,
      });
    });

    it('claims a placeholder row with the sheet\'s "Yesterday LO", not zero', async () => {
      prisma.inventory.groupBy.mockResolvedValue([
        {
          date: new Date('2026-04-14T00:00:00.000Z'),
          isAutoGenerated: true,
          _count: { _all: 160 },
        },
      ]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Pandesal', 10, 3, 1, 42]],
        },
      ]);

      await service.importWorkbook(buf, 7, 'sheet.xlsx');

      const call = prisma.inventory.upsert.mock.calls[0][0];
      expect(call.update).toMatchObject({
        quantity: 42,
        delivery: 10,
        leftover: 3,
        reject: 1,
        isAutoGenerated: false,
      });
    });

    it('sums "Yesterday LO" across duplicate rows for the same product', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [
            ['Pandesal', 10, 3, 1, 20],
            ['Pandesal', 5, 2, 1, 7],
          ],
        },
      ]);

      await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(prisma.inventory.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.inventory.upsert.mock.calls[0][0].create).toMatchObject({
        quantity: 27,
        delivery: 15,
        leftover: 5,
        reject: 2,
      });
    });

    it('aggregates duplicate product rows within a sheet', async () => {
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/25',
          rows: [
            ['Pandesal', 10, 3, 1],
            ['Pandesal', 5, 2, 1],
          ],
        },
      ]);

      await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(prisma.inventory.upsert).toHaveBeenCalledTimes(1);
      const call = prisma.inventory.upsert.mock.calls[0][0];
      expect(call.create).toMatchObject({
        delivery: 15,
        leftover: 5,
        reject: 2,
      });
    });

    it('refuses a sheet containing an ambiguous label instead of summing it', async () => {
      // A second, clean sheet keeps this a per-sheet test: without it the
      // whole import would abort with the server-side ambiguity refusal
      // (covered separately below) and there would be no sheet result to
      // inspect.
      prisma.product.findMany.mockResolvedValue([
        { id: 1, name: 'Pandesal', price: 0 },
        // Two real SKUs sharing a name, separated only by price — the sheet
        // rows here carry price 0 (buildSheet hardcodes column B), so neither
        // price matches and the resolver must refuse.
        { id: 119, name: 'Bonette', price: 30 },
        { id: 120, name: 'Bonette', price: 8 },
      ]);
      prisma.productAlias.findMany.mockResolvedValue([]); // nothing disambiguates
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Bonette', 5, 2, 0]],
        },
        {
          name: 'Day (2)',
          dateHeader: '4/15/26',
          rows: [['Pandesal', 10, 3, 1]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      const ids = prisma.inventory.upsert.mock.calls.map(
        (c) => c[0].where.branchId_productId_date.productId,
      );
      expect(ids).toEqual([1]); // neither Bonette was written, nor summed
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/Bonette/);
      expect(res.sheets[0].errors[0]).toMatch(/matches none of the 2 product/);
    });

    it('does not report ignored equipment labels as errors', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 1, name: 'Pandesal', price: 0 }]);
      prisma.productAlias.findMany.mockResolvedValue([]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [
            ['Pandesal', 10, 3, 1],
            ['Estante', 0, 0, 0],
            ['Freezer', 0, 0, 0],
          ],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(res.sheets[0].processed).toBe(1);
      expect(res.sheets[0].skipped).toBe(0);
      expect(res.sheets[0].errors).toEqual([]);
    });

    it('aborts a bote-section label with no alias even when the catalog name is unique, proving section context flows from the sheet into the resolver', async () => {
      // "Litro" has a single catalog match, so if section tracking were
      // broken (label resolved as if it were always 'main'), this would
      // resolve happily via the catalog-uniqueness fallback and upsert.
      // Because it sits under a "Bote:" header with no alias, the resolver
      // must refuse it as ambiguous instead.
      prisma.product.findMany.mockResolvedValue([
        // Only the DRINK is seeded (₱45); the ₱10 bote deposit is missing.
        // The sheet's bote row must refuse rather than book returns as sales.
        { id: 50, name: 'Litro', price: 45 },
        { id: 1, name: 'Pandesal', price: 0 },
      ]);
      prisma.productAlias.findMany.mockResolvedValue([]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [
            ['Bote:', 0, 0, 0],
            ['Litro', 5, 2, 0],
          ],
        },
        // Clean sheet so the run is a partial import, not a whole-file abort.
        {
          name: 'Day (2)',
          dateHeader: '4/15/26',
          rows: [['Pandesal', 10, 3, 1]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      const ids = prisma.inventory.upsert.mock.calls.map(
        (c) => c[0].where.branchId_productId_date.productId,
      );
      expect(ids).not.toContain(50);
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/bote/i);
    });

    it('skips the whole sheet on ambiguity, including its otherwise-valid rows', async () => {
      // Regression guard for a mutation that recorded the ambiguity error but
      // still upserted the sheet's other, unambiguous rows. The sheet must be
      // all-or-nothing: one unresolved label blocks every row on that sheet,
      // not just its own.
      prisma.product.findMany.mockResolvedValue([
        { id: 1, name: 'Pandesal', price: 0 },
        { id: 2, name: 'Ensaymada Big', price: 0 },
        // Two real SKUs sharing a name, separated only by price — the sheet
        // rows here carry price 0 (buildSheet hardcodes column B), so neither
        // price matches and the resolver must refuse.
        { id: 119, name: 'Bonette', price: 30 },
        { id: 120, name: 'Bonette', price: 8 },
      ]);
      prisma.productAlias.findMany.mockResolvedValue([]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [
            ['Pandesal', 10, 3, 1], // clearly valid, unique catalog match
            ['Bonette', 5, 2, 0], // ambiguous
          ],
        },
        // A separate clean sheet, so the file as a whole is a partial import
        // and the ambiguous sheet's own result stays inspectable.
        {
          name: 'Day (2)',
          dateHeader: '4/15/26',
          rows: [['Ensaymada Big', 4, 1, 0]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      const ids = prisma.inventory.upsert.mock.calls.map(
        (c) => c[0].where.branchId_productId_date.productId,
      );
      // Pandesal shared the ambiguous sheet, so it must NOT be written even
      // though it resolved cleanly; only the other sheet's row lands.
      expect(ids).toEqual([2]);
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/Bonette/);
      expect(res.sheets[0].errors[0]).toMatch(/matches none of the 2 product/);
    });

    // -----------------------------------------------------------------------
    // I5 — a zero-row import must not burn the file's SHA-256
    // -----------------------------------------------------------------------

    describe('ImportLog creation', () => {
      it('does not write an ImportLog when no row was processed', async () => {
        // Nothing was written, so nothing may be recorded as an import —
        // otherwise the hash guard permanently rejects the corrected re-run,
        // and recovery needs ADMIN while import is MANAGER.
        const buf = buildWorkbook([
          {
            name: 'Day (16)',
            dateHeader: '1/0/00',
            rows: [['Pandesal', 1, 1, 1]],
          },
        ]);

        const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

        expect(res.summary.totalProcessed).toBe(0);
        expect(prisma.importLog.create).not.toHaveBeenCalled();
      });

      it('does not write an ImportLog for an all-zero workbook', async () => {
        const buf = buildWorkbook([
          {
            name: 'Day 0',
            dateHeader: '4/28/26',
            rows: [
              ['Pandesal', 0, 0, 0],
              ['Ensaymada Big', 0, 0, 0],
            ],
          },
        ]);

        const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

        expect(res.summary.totalProcessed).toBe(0);
        expect(prisma.importLog.create).not.toHaveBeenCalled();
      });

      it('still writes a PARTIAL ImportLog when at least one row was processed', async () => {
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [
              ['Pandesal', 10, 3, 1],
              ['Unknown Item', 4, 4, 0],
            ],
          },
        ]);

        const res = await service.importWorkbook(
          buf,
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [],
          ['Unknown Item'],
        );

        expect(res.summary.totalProcessed).toBe(1);
        expect(prisma.importLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'PARTIAL', rowCount: 1 }),
          }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // I6 — ambiguity blocking must hold server-side, not just in the UI
    // -----------------------------------------------------------------------

    describe('server-side ambiguity blocking', () => {
      function ambiguousWorkbook() {
        prisma.product.findMany.mockResolvedValue([
          { id: 119, name: 'Bonette', price: 30 },
          { id: 120, name: 'Bonette', price: 8 },
        ]);
        prisma.productAlias.findMany.mockResolvedValue([]);
        return buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [['Bonette', 5, 2, 0]],
          },
        ]);
      }

      it('throws ConflictException when ambiguity left nothing to import', async () => {
        // The Flutter client and plain curl never see page.tsx's disabled
        // buttons; the refusal has to live on the server.
        await expect(
          service.importWorkbook(ambiguousWorkbook(), 7, 'sheet.xlsx'),
        ).rejects.toThrow(ConflictException);
        expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      });

      it('names the ambiguous label and tells the caller to add a ProductAlias', async () => {
        await expect(
          service.importWorkbook(ambiguousWorkbook(), 7, 'sheet.xlsx'),
        ).rejects.toThrow(/Bonette/);
        await expect(
          service.importWorkbook(ambiguousWorkbook(), 7, 'sheet.xlsx'),
        ).rejects.toThrow(/ProductAlias/);
      });

      it('writes no ImportLog on the ambiguity throw path, so the file can be re-imported', async () => {
        await expect(
          service.importWorkbook(ambiguousWorkbook(), 7, 'sheet.xlsx'),
        ).rejects.toThrow(ConflictException);
        expect(prisma.importLog.create).not.toHaveBeenCalled();
      });

      it('does not throw when another sheet imported successfully, and still logs the partial import', async () => {
        prisma.product.findMany.mockResolvedValue([
          { id: 1, name: 'Pandesal', price: 0 },
          { id: 119, name: 'Bonette', price: 30 },
          { id: 120, name: 'Bonette', price: 8 },
        ]);
        prisma.productAlias.findMany.mockResolvedValue([]);
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [['Bonette', 5, 2, 0]],
          },
          {
            name: 'Day (2)',
            dateHeader: '4/15/26',
            rows: [['Pandesal', 10, 3, 1]],
          },
        ]);

        const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

        expect(res.summary.totalProcessed).toBe(1);
        expect(res.sheets[0].processed).toBe(0);
        expect(res.sheets[0].errors[0]).toMatch(/Bonette/);
      expect(res.sheets[0].errors[0]).toMatch(/matches none of the 2 product/);
        expect(prisma.importLog.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'PARTIAL' }),
          }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // M7 — aliases must respect the soft-delete filter
    // -----------------------------------------------------------------------

    describe('unknown-label resolution', () => {
      const workbook = () =>
        buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [
              ['Pandesal', 10, 3, 1],
              ['PAGE 2', 0, 0, 0],
              ['Choco Bar', 4, 4, 0, undefined, 45],
            ],
          },
        ]);

      it('refuses the import when an unknown label is neither created nor acknowledged', async () => {
        // The web UI disables its button, but Flutter and curl never see it.
        // Without this the label is silently dropped and a product's whole
        // history goes missing from the file.
        await expect(
          service.importWorkbook(workbook(), 7, 'sheet.xlsx'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      });

      it('names the unresolved label so the caller knows what to fix', async () => {
        await expect(
          service.importWorkbook(workbook(), 7, 'sheet.xlsx'),
        ).rejects.toThrow(/Choco Bar/);
      });

      it('writes no ImportLog when it refuses, so the file can be re-uploaded', async () => {
        // An ImportLog would burn this file's SHA-256 and the duplicate guard
        // would then reject the corrected re-run forever.
        await expect(
          service.importWorkbook(workbook(), 7, 'sheet.xlsx'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.importLog.create).not.toHaveBeenCalled();
      });

      it('proceeds when the label is explicitly acknowledged, still skipping it', async () => {
        const res = await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [],
          ['Choco Bar'],
        );

        expect(res.sheets[0].processed).toBe(1);
        expect(res.sheets[0].errors).toContain(
          'Product not found: "Choco Bar"',
        );
        expect(prisma.product.create).not.toHaveBeenCalled();
      });

      it('matches acknowledgement case-insensitively, as labels are matched', async () => {
        const res = await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [],
          ['choco bar'],
        );

        expect(res.sheets[0].processed).toBe(1);
      });

      it('creates a requested product with the sheet price and chosen type', async () => {
        await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [{ label: 'Choco Bar', type: 'CAKE' }],
        );

        expect(prisma.product.create).toHaveBeenCalledTimes(1);
        expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({
          name: 'Choco Bar',
          type: 'CAKE',
          price: 45,
        });
      });

      it('records the created product price history from the sheet dates', async () => {
        await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [{ label: 'Choco Bar', type: 'CAKE' }],
        );

        expect(prisma.productPriceHistory.createMany).toHaveBeenCalledTimes(1);
        expect(
          prisma.productPriceHistory.createMany.mock.calls[0][0].data,
        ).toEqual([
          {
            productId: 100,
            price: 45,
            effectiveAt: new Date('2026-04-14T00:00:00.000Z'),
          },
        ]);
      });

      it('imports the newly created product rather than skipping it', async () => {
        // The resolver is rebuilt after creation, so the label that triggered
        // the create now matches it.
        const res = await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [{ label: 'Choco Bar', type: 'CAKE' }],
        );

        expect(res.sheets[0].processed).toBe(2);
        expect(res.sheets[0].skipped).toBe(0);
        const created = prisma.inventory.upsert.mock.calls
          .map((c: any[]) => c[0])
          .find(
            (c: any) => c.where.branchId_productId_date.productId === 100,
          );
        expect(created.create).toMatchObject({ delivery: 4, leftover: 4 });
      });

      it('appends the new product after the last sortOrder rather than colliding', async () => {
        await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [{ label: 'Choco Bar', type: 'CAKE' }],
        );

        expect(prisma.product.create.mock.calls[0][0].data.sortOrder).toBe(21);
      });

      it('refuses a create request for a label the workbook does not contain', async () => {
        // Guards against a stale preview: the operator confirmed a label, then
        // uploaded a different file.
        await expect(
          service.importWorkbook(
            workbook(),
            7,
            'sheet.xlsx',
            undefined,
            'skip',
            [{ label: 'Nonexistent', type: 'CAKE' }],
          ),
        ).rejects.toThrow(/Nonexistent/);
        expect(prisma.product.create).not.toHaveBeenCalled();
      });

      it('does not refuse a workbook whose labels all match', async () => {
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [['Pandesal', 10, 3, 1]],
          },
        ]);

        const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

        expect(res.sheets[0].processed).toBe(1);
      });

      it('still refuses on ambiguity before considering unknown labels', async () => {
        // Ambiguity is the older, harder guard; an unknown label must not
        // change which error the operator sees first.
        prisma.product.findMany.mockResolvedValue([
          { id: 1, name: 'Bonette', price: 30 },
          { id: 2, name: 'Bonette', price: 8 },
        ]);
        const buf = buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [['Bonette', 10, 3, 1, undefined, 99]],
          },
        ]);

        await expect(
          service.importWorkbook(buf, 7, 'sheet.xlsx'),
        ).rejects.toThrow(/ProductAlias/);
      });
    });

    describe('soft-deleted products behind aliases', () => {
      const aliasRows = [
        {
          sheetLabel: 'bonette small',
          section: null,
          priceHint: null,
          productId: 121,
        },
      ];
      const workbook = () =>
        buildWorkbook([
          {
            name: 'Day (1)',
            dateHeader: '4/14/26',
            rows: [
              ['Pandesal', 10, 3, 1],
              ['Bonette Small', 5, 2, 0],
            ],
          },
        ]);

      it('does not write inventory for an alias pointing at a soft-deleted product', async () => {
        // buildCatalog() filters deletedAt: null, so product 121 is absent
        // from the live catalog — the alias must not smuggle it back in.
        prisma.product.findMany.mockResolvedValue([{ id: 1, name: 'Pandesal', price: 0 }]);
        prisma.productAlias.findMany.mockResolvedValue(aliasRows);

        // The dead alias makes the label unmatched, which now has to be
        // acknowledged; the point of the test is where the row does NOT go.
        const res = await service.importWorkbook(
          workbook(),
          7,
          'sheet.xlsx',
          undefined,
          'skip',
          [],
          ['Bonette Small'],
        );

        const ids = prisma.inventory.upsert.mock.calls.map(
          (c) => c[0].where.branchId_productId_date.productId,
        );
        expect(ids).not.toContain(121);
        expect(ids).toEqual([1]);
        expect(res.sheets[0].errors).toContain(
          'Product not found: "Bonette Small"',
        );
      });

      it('still honours an alias pointing at a live product', async () => {
        prisma.product.findMany.mockResolvedValue([
          { id: 1, name: 'Pandesal', price: 0 },
          { id: 121, name: 'Bonette Small', price: 0 },
        ]);
        prisma.productAlias.findMany.mockResolvedValue(aliasRows);

        const res = await service.importWorkbook(workbook(), 7, 'sheet.xlsx');

        const ids = prisma.inventory.upsert.mock.calls.map(
          (c) => c[0].where.branchId_productId_date.productId,
        );
        expect(ids).toContain(121);
        expect(res.sheets[0].errors).toEqual([]);
      });
    });
  });
});
