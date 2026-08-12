import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as XLSX from 'xlsx';
import { InventoryImportService } from './inventory-import.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    branch: { findFirst: jest.fn() },
    product: { findMany: jest.fn() },
    inventory: { upsert: jest.fn() },
    importLog: {
      findFirst: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Workbook builder — mirrors the bakery template layout:
//   col A = product name, col C = delivery (__EMPTY_1),
//   col E = leftover (__EMPTY_3), col G = reject (the date column).
// ---------------------------------------------------------------------------

type DataRow = [
  name: string,
  delivery: number,
  leftover: number,
  reject: number,
];

function buildSheet(dateHeader: string, rows: DataRow[]): unknown[][] {
  return [
    ['PAGE 1', null, null, null, null, 'DATE:', dateHeader],
    ['PRODUCTS', 'PRICES', 'DELIVERY', 'TOTAL', 'LEFTOVER', 'TOTAL', 'REJECT'],
    ...rows.map(([name, d, l, r]) => [name, '0', d, '0', l, '0', r]),
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

  beforeEach(async () => {
    prisma = makePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryImportService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(InventoryImportService);

    // Default catalog used by most tests.
    prisma.product.findMany.mockResolvedValue([
      { id: 1, name: 'Pandesal' },
      { id: 2, name: 'Ensaymada Big' },
    ]);
    prisma.branch.findFirst.mockResolvedValue({ id: 7, name: 'Silang' });
    prisma.importLog.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockResolvedValue([]);
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

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx', 55);

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
  });
});
