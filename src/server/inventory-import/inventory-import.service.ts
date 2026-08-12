import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';

export interface DryRunSheet {
  sheetName: string;
  date: string; // '' when the date could not be determined
  matched: number; // distinct products found in the catalog
  unmatchedCount: number; // distinct names that did not match a product
  unmatched: string[]; // distinct unmatched names (so the manager can fix the catalog)
  error?: string; // sheet-level problem (e.g. no date header)
}

export interface DryRunResult {
  fileName: string;
  branch: { id: number; name: string } | null;
  alreadyImported: { logId: number; importedAt: string } | null;
  summary: {
    totalSheets: number;
    totalMatched: number;
    totalUnmatched: number;
    datesDetected: string[];
  };
  sheets: DryRunSheet[];
}

export interface SheetImportResult {
  sheetName: string;
  date: string;
  processed: number;
  skipped: number;
  errors: string[];
}

export interface ImportResult {
  summary: {
    totalSheets: number;
    totalProcessed: number;
    totalSkipped: number;
    totalErrors: number;
  };
  sheets: SheetImportResult[];
}

export interface ImportLogItem {
  id: number;
  branchId: number;
  fileName: string;
  fileHash: string;
  importedBy: number | null;
  importedAt: Date;
  sheetCount: number;
  rowCount: number;
  skippedCount: number;
  status: string;
  notes: string | null;
  branch: { name: string };
  importedByUser: { email: string } | null;
}

export interface ImportLogsResponse {
  total: number;
  page: number;
  limit: number;
  items: ImportLogItem[];
}

type Counts = { delivery: number; leftover: number; reject: number };

const SKIP_SHEETS = new Set([
  'pricelist',
  'Del Sheet',
  'Prod Sheet',
  'Blank columns and rows',
]);

// A data sheet is named "Day 0" or "Day (n)". Anything else (price lists,
// summary tabs, blank scaffolding) is ignored.
function isDaySheet(name: string): boolean {
  if (SKIP_SHEETS.has(name)) return false;
  return /^Day\s*(0|\(\d+\))$/i.test(name);
}

function isSkippableLabel(name: string): boolean {
  const s = name.trim();
  if (!s) return true;
  if (/^page\s+\d+$/i.test(s)) return true;
  if (
    /^(products|total|summary|pullout|pullin|actual\s+sales|short\s*\/\s*over|notes:|vale:|bote:)$/i.test(
      s,
    )
  )
    return true;
  if (
    /^(l\/o start|add: delivery|less: reject|less: out|less: l\/o end|expected sales)$/i.test(
      s,
    )
  )
    return true;
  if (/^0(\.0+)?$/.test(s)) return true;
  return false;
}

function parseDateKey(key: string): Date {
  const [m, d, y] = key.split('/').map(Number);
  const fullYear = y < 100 ? 2000 + y : y;
  return new Date(Date.UTC(fullYear, m - 1, d));
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseCount(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const n = parseFloat(
    String(val)
      .trim()
      .replace(/[^\d.\-]/g, ''),
  );
  return isNaN(n) ? 0 : Math.round(n);
}

@Injectable()
export class InventoryImportService {
  constructor(private readonly prisma: PrismaService) {}

  private hashBuffer(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async assertBranchExists(
    branchId: number,
  ): Promise<{ id: number; name: string }> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!branch) throw new NotFoundException(`Branch ${branchId} not found.`);
    return branch;
  }

  private async buildProductMap(): Promise<Map<string, number>> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const productMap = new Map<string, number>();
    for (const p of products) {
      productMap.set(p.name.trim().toLowerCase(), p.id);
    }
    return productMap;
  }

  private extractSheetDate(
    rows: Record<string, unknown>[],
  ): { dateKey: string; sheetDate: Date } | null {
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(key)) {
          return { dateKey: key, sheetDate: parseDateKey(key) };
        }
      }
    }
    return null;
  }

  // Walks one sheet's rows, accumulating delivery/leftover/reject per matched
  // product and collecting the names that did not match the catalog. Shared by
  // both the dry-run preview and the real import so they never diverge.
  private collectSheetEntries(
    rows: Record<string, unknown>[],
    dateKey: string,
    productMap: Map<string, number>,
  ): { accumulator: Map<number, Counts>; unmatched: string[] } {
    const accumulator = new Map<number, Counts>();
    const unmatched: string[] = [];
    for (const row of rows) {
      const rawName = row['PAGE 1'];
      if (typeof rawName !== 'string') continue;
      const productName = rawName.trim();
      if (isSkippableLabel(productName)) continue;
      const productId = productMap.get(productName.toLowerCase());
      if (!productId) {
        unmatched.push(productName);
        continue;
      }
      const delivery = parseCount(row['__EMPTY_1']);
      const leftover = parseCount(row['__EMPTY_3']);
      const reject = parseCount(row[dateKey]);
      const existing = accumulator.get(productId);
      if (existing) {
        existing.delivery += delivery;
        existing.leftover += leftover;
        existing.reject += reject;
      } else {
        accumulator.set(productId, { delivery, leftover, reject });
      }
    }
    return { accumulator, unmatched };
  }

  private async upsertAccumulated(
    branchId: number,
    sheetDate: Date,
    accumulator: Map<number, Counts>,
  ) {
    const upserts = Array.from(accumulator.entries()).map(
      ([productId, counts]) =>
        this.prisma.inventory.upsert({
          where: {
            branchId_productId_date: { branchId, productId, date: sheetDate },
          },
          update: counts,
          create: {
            branchId,
            productId,
            date: sheetDate,
            quantity: 0,
            ...counts,
          },
        }),
    );
    if (upserts.length > 0) {
      await this.prisma.$transaction(upserts);
    }
  }

  // Parses the workbook without writing anything, reporting per-sheet dates and
  // which product names matched the catalog. When a branchId is supplied it also
  // validates the branch and flags whether this exact file was already imported.
  async dryRunWorkbook(
    buffer: Buffer,
    originalName: string,
    branchId?: number,
  ): Promise<DryRunResult> {
    let branch: { id: number; name: string } | null = null;
    let alreadyImported: { logId: number; importedAt: string } | null = null;
    if (branchId !== undefined) {
      branch = await this.assertBranchExists(branchId);
      const fileHash = this.hashBuffer(buffer);
      const existing = await this.prisma.importLog.findFirst({
        where: { branchId, fileHash },
        select: { id: true, importedAt: true },
      });
      if (existing) {
        alreadyImported = {
          logId: existing.id,
          importedAt: existing.importedAt.toISOString().slice(0, 10),
        };
      }
    }

    const productMap = await this.buildProductMap();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheets: DryRunSheet[] = [];

    for (const sheetName of workbook.SheetNames) {
      if (!isDaySheet(sheetName)) continue;

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[sheetName],
        { defval: null, raw: false },
      );

      const dateMeta = this.extractSheetDate(rows);
      if (!dateMeta) {
        sheets.push({
          sheetName,
          date: '',
          matched: 0,
          unmatchedCount: 0,
          unmatched: [],
          error: 'Could not determine date from column headers',
        });
        continue;
      }

      const { accumulator, unmatched } = this.collectSheetEntries(
        rows,
        dateMeta.dateKey,
        productMap,
      );
      const distinct = [...new Set(unmatched)];
      sheets.push({
        sheetName,
        date: toDateStr(dateMeta.sheetDate),
        matched: accumulator.size,
        unmatchedCount: distinct.length,
        unmatched: distinct,
      });
    }

    const datesDetected = sheets.filter((s) => s.date).map((s) => s.date);
    const totalMatched = sheets.reduce((sum, s) => sum + s.matched, 0);
    const totalUnmatched = sheets.reduce((sum, s) => sum + s.unmatchedCount, 0);

    return {
      fileName: originalName,
      branch,
      alreadyImported,
      summary: {
        totalSheets: sheets.length,
        totalMatched,
        totalUnmatched,
        datesDetected,
      },
      sheets,
    };
  }

  async importWorkbook(
    buffer: Buffer,
    branchId: number,
    originalName: string,
    userId?: number,
  ): Promise<ImportResult> {
    await this.assertBranchExists(branchId);

    const fileHash = this.hashBuffer(buffer);

    const existing = await this.prisma.importLog.findFirst({
      where: { branchId, fileHash },
      select: { id: true, importedAt: true },
    });
    if (existing) {
      throw new ConflictException(
        `This file was already imported for this branch on ` +
          `${existing.importedAt.toISOString().slice(0, 10)} (log #${existing.id}). ` +
          `Delete the existing log first or use a corrected file.`,
      );
    }

    const productMap = await this.buildProductMap();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetResults: SheetImportResult[] = [];

    for (const sheetName of workbook.SheetNames) {
      if (!isDaySheet(sheetName)) continue;

      const result: SheetImportResult = {
        sheetName,
        date: '',
        processed: 0,
        skipped: 0,
        errors: [],
      };

      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: null,
          raw: false,
        },
      );

      const dateMeta = this.extractSheetDate(rows);
      if (!dateMeta) {
        result.errors.push('Could not determine date from column headers');
        sheetResults.push(result);
        continue;
      }

      result.date = toDateStr(dateMeta.sheetDate);
      const { accumulator, unmatched } = this.collectSheetEntries(
        rows,
        dateMeta.dateKey,
        productMap,
      );
      result.skipped = unmatched.length;
      for (const name of unmatched) {
        result.errors.push(`Product not found: "${name}"`);
      }
      await this.upsertAccumulated(branchId, dateMeta.sheetDate, accumulator);
      result.processed = accumulator.size;
      sheetResults.push(result);
    }

    const totalProcessed = sheetResults.reduce(
      (sum, r) => sum + r.processed,
      0,
    );
    const totalSkipped = sheetResults.reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = sheetResults.reduce(
      (sum, r) => sum + r.errors.length,
      0,
    );

    try {
      await this.prisma.importLog.create({
        data: {
          branchId,
          fileName: originalName,
          fileHash,
          importedBy: userId ?? null,
          sheetCount: sheetResults.length,
          rowCount: totalProcessed,
          skippedCount: totalSkipped,
          status: totalErrors > 0 ? 'PARTIAL' : 'SUCCESS',
          notes:
            totalErrors > 0
              ? `${totalErrors} row-level errors encountered`
              : null,
        },
      });
    } catch (err) {
      // Log creation failure should not roll back a successful import.
      // The inventory data is already written; log for ops visibility.
      console.error('Failed to create ImportLog after successful import:', err);
    }

    return {
      summary: {
        totalSheets: sheetResults.length,
        totalProcessed,
        totalSkipped,
        totalErrors,
      },
      sheets: sheetResults,
    };
  }

  async getLogs(opts: {
    branchId?: number;
    page: number;
    limit: number;
  }): Promise<ImportLogsResponse> {
    const where = opts.branchId ? { branchId: opts.branchId } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.importLog.count({ where }),
      this.prisma.importLog.findMany({
        where,
        orderBy: { importedAt: 'desc' },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          branch: { select: { name: true } },
          importedByUser: { select: { email: true } },
        },
      }),
    ]);
    return { total, page: opts.page, limit: opts.limit, items };
  }

  async deleteLog(id: number) {
    const log = await this.prisma.importLog.findFirst({ where: { id } });
    if (!log) throw new NotFoundException('Import log not found');
    return this.prisma.importLog.delete({ where: { id } });
  }
}
