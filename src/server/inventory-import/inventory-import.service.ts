import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import {
  LabelResolver,
  type PriceHistoryMap,
  type ProductCandidate,
} from './label-resolver';
import {
  isIgnoredLabel,
  pageForRow,
  sectionForRow,
  suggestedTypeFor,
  type ProductType,
  type SheetSection,
} from './sheet-sections';

/**
 * A sheet label that matched no product, described richly enough that the
 * operator can turn it into a Product without retyping anything.
 *
 * Deduplicated per label across the whole workbook: the same name appears on
 * every day sheet, and one product is created for it, not eighteen.
 */
/** One unmatched row, before rows are folded together per label. */
interface UnmatchedDetail {
  label: string;
  price: number;
  page: number;
  section: SheetSection;
}

export interface UnknownProduct {
  label: string; // verbatim column A text
  price: number; // price at the earliest sheet that names it
  page: number; // which PAGE block it sits under
  // Derived from page and section; the operator confirms it before anything
  // is written.
  suggestedType: ProductType;
  occurrences: number; // how many day sheets name it
  firstSeen: string; // YYYY-MM-DD of the earliest such sheet
  // Every distinct price the label carries, in date order. A label seen at two
  // prices is one product that was repriced, not two SKUs, so these become
  // ProductPriceHistory rows rather than extra products.
  priceChanges: { price: number; effectiveAt: string }[];
}

export interface DryRunSheet {
  sheetName: string;
  date: string; // '' when the date could not be determined
  matched: number; // distinct products found in the catalog
  unmatchedCount: number; // distinct names that did not match a product
  unmatched: string[]; // distinct unmatched names (so the manager can fix the catalog)
  ambiguous: string[]; // labels matching several products with no alias
  error?: string; // sheet-level problem (e.g. no date header)
  // Rows already stored for this sheet's date+branch (branch mode only).
  // Placeholders are untouched autofill rows and never block an import;
  // real rows require an explicit conflictMode to overwrite.
  existing?: { placeholders: number; real: number };
}

// What to do when a sheet's date already has real (non-placeholder) rows:
// 'skip' leaves the day untouched, 'overwrite' replaces it with the sheet.
export type ImportConflictMode = 'skip' | 'overwrite';

/**
 * An operator's decision to turn an unmatched sheet label into a product.
 *
 * Only the type is theirs to choose; name and price are read from the workbook
 * so the created product cannot fail to match the label that requested it.
 */
export interface CreateProductRequest {
  label: string;
  type: ProductType;
}

export interface DryRunResult {
  fileName: string;
  branch: { id: number; name: string } | null;
  alreadyImported: { logId: number; importedAt: string } | null;
  summary: {
    totalSheets: number;
    totalMatched: number;
    totalUnmatched: number;
    totalAmbiguous: number;
    datesDetected: string[];
  };
  sheets: DryRunSheet[];
  // Every unmatched label in the workbook, deduplicated and enriched so the
  // operator can create the missing products before importing.
  unknownProducts: UnknownProduct[];
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

type Counts = {
  quantity: number;
  delivery: number;
  leftover: number;
  reject: number;
};

// Unused template tabs reference blank cells for their date, which Excel
// renders as 1/0/00 (→ 1999-12-31). Any date before this year is template
// junk, not bakery data.
const MIN_PLAUSIBLE_YEAR = 2020;

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
    /^(l\/o start|add: delivery|less: reject|less: out|less: l\/o end)$/i.test(
      s,
    )
  )
    return true;
  // "Expected Sales" / "Expected Sales (Dapat Benta)" summary rows.
  if (/^expected sales\b/i.test(s)) return true;
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

// Deliberately ignores `quantity`. "Yesterday LO" is a formula pointing at the
// previous tab, so an unused template tab inherits a real opening balance while
// its own delivery/leftover/reject stay blank. Counting quantity here would let
// those junk tabs past the all-zero guard and overwrite real days.
function hasNonZeroCounts(accumulator: Map<number, Counts>): boolean {
  for (const c of accumulator.values()) {
    if (c.delivery !== 0 || c.leftover !== 0 || c.reject !== 0) return true;
  }
  return false;
}

/**
 * Key of the "Yesterday LO" column — the day's opening stock, which the app
 * models as `Inventory.quantity`.
 *
 * Located by header text rather than by position: `Day 0` omits the column
 * entirely, and the columns to its left vary between workbooks. Returns null
 * when the sheet has no such column, in which case quantity falls back to 0.
 */
function findYesterdayLeftoverKey(
  rows: Record<string, unknown>[],
): string | null {
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== 'string') continue;
      if (value.trim().toLowerCase() === 'yesterday lo') return key;
    }
  }
  return null;
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

/** Column B holds the unit price as a formatted string, e.g. "36.00". */
function parsePrice(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).trim().replace(/[^\d.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
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

  // Products keyed by lowercased name. A name may carry SEVERAL products —
  // that is the point: two real SKUs share a label and the price separates
  // them (see prisma/seed-products-apr2026.sql).
  private async buildCatalog(): Promise<Map<string, ProductCandidate[]>> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, price: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const catalog = new Map<string, ProductCandidate[]>();
    for (const p of products) {
      const key = p.name.trim().toLowerCase();
      const entry = { productId: p.id, price: Number(p.price) };
      const list = catalog.get(key);
      if (list) list.push(entry);
      else catalog.set(key, [entry]);
    }
    return catalog;
  }

  // Price changes per product, ascending by effectiveAt — the order
  // getEffectivePrice() relies on to pick the price in force on a given date.
  private async buildPriceHistory(): Promise<PriceHistoryMap> {
    const rows = await this.prisma.productPriceHistory.findMany({
      select: { productId: true, price: true, effectiveAt: true },
      orderBy: { effectiveAt: 'asc' },
    });
    const history: PriceHistoryMap = new Map();
    for (const r of rows) {
      const list = history.get(r.productId);
      const entry = { price: Number(r.price), effectiveAt: r.effectiveAt };
      if (list) list.push(entry);
      else history.set(r.productId, [entry]);
    }
    return history;
  }

  private async buildResolver(): Promise<LabelResolver> {
    const [catalog, aliasRows, priceHistory] = await Promise.all([
      this.buildCatalog(),
      this.prisma.productAlias.findMany({
        select: {
          sheetLabel: true,
          section: true,
          priceHint: true,
          productId: true,
        },
      }),
      this.buildPriceHistory(),
    ]);
    // buildCatalog() already drops soft-deleted products; aliases must obey
    // the same filter or an alias could resolve to a product that is invisible
    // in every report. Dropping the row makes the label fail loudly (bote /
    // price-hint refusal, or "product not found") instead of writing
    // inventory nobody can see.
    const liveProductIds = new Set<number>();
    for (const entries of catalog.values()) {
      for (const e of entries) liveProductIds.add(e.productId);
    }

    return new LabelResolver(
      aliasRows
        .filter((a) => liveProductIds.has(a.productId))
        .map((a) => ({
          sheetLabel: a.sheetLabel,
          section: a.section,
          priceHint: a.priceHint === null ? null : Number(a.priceHint),
          productId: a.productId,
        })),
      catalog,
      priceHistory,
    );
  }

  // One batched groupBy for all sheet dates: how many rows already exist per
  // date for this branch, split into autofill placeholders vs real data.
  private async fetchExistingByDate(
    branchId: number,
    dates: Date[],
  ): Promise<Map<string, { placeholders: number; real: number }>> {
    const map = new Map<string, { placeholders: number; real: number }>();
    if (dates.length === 0) return map;
    const groups = await this.prisma.inventory.groupBy({
      by: ['date', 'isAutoGenerated'],
      where: { branchId, date: { in: dates }, deletedAt: null },
      _count: { _all: true },
    });
    for (const g of groups) {
      const key = g.date.toISOString().slice(0, 10);
      const entry = map.get(key) ?? { placeholders: 0, real: 0 };
      if (g.isAutoGenerated) entry.placeholders += g._count._all;
      else entry.real += g._count._all;
      map.set(key, entry);
    }
    return map;
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
    resolver: LabelResolver,
    sheetDate: Date,
  ): {
    accumulator: Map<number, Counts>;
    unmatched: string[];
    unmatchedDetails: UnmatchedDetail[];
    ambiguous: string[];
    ambiguousLabels: string[];
  } {
    const accumulator = new Map<number, Counts>();
    const unmatched: string[] = [];
    const unmatchedDetails: UnmatchedDetail[] = [];
    const ambiguous: string[] = [];
    const ambiguousLabels: string[] = [];
    let section: SheetSection = 'main';
    // Page 1 is implicit — it has no "PAGE 1" row, only a column heading.
    let page = 1;
    const yloKey = findYesterdayLeftoverKey(rows);

    for (const row of rows) {
      const rawName = row['PAGE 1'];
      if (typeof rawName !== 'string') continue;
      const productName = rawName.trim();

      // Section and page headers are themselves skippable labels, so update
      // both before the skip test discards the row.
      section = sectionForRow(productName, section);
      page = pageForRow(productName, page);

      if (isSkippableLabel(productName)) continue;
      if (isIgnoredLabel(productName)) continue;

      const price = parsePrice(row['__EMPTY']);
      // The sheet's own date decides which price was in force, so a workbook
      // from last year resolves against last year's prices.
      const res = resolver.resolve(productName, section, price, sheetDate);
      if (res.kind === 'ambiguous') {
        ambiguous.push(res.reason);
        ambiguousLabels.push(productName);
        continue;
      }
      if (res.kind === 'unmatched') {
        unmatched.push(productName);
        unmatchedDetails.push({
          label: productName,
          price: price ?? 0,
          page,
          section,
        });
        continue;
      }

      const delivery = parseCount(row['__EMPTY_1']);
      const leftover = parseCount(row['__EMPTY_3']);
      const reject = parseCount(row[dateKey]);
      const quantity = yloKey === null ? 0 : parseCount(row[yloKey]);
      const existing = accumulator.get(res.productId);
      if (existing) {
        existing.quantity += quantity;
        existing.delivery += delivery;
        existing.leftover += leftover;
        existing.reject += reject;
      } else {
        accumulator.set(res.productId, {
          quantity,
          delivery,
          leftover,
          reject,
        });
      }
    }
    return {
      accumulator,
      unmatched,
      unmatchedDetails,
      ambiguous,
      ambiguousLabels,
    };
  }

  /**
   * Folds per-sheet unmatched rows into one entry per label.
   *
   * Sheets are visited in date order so `firstSeen`, the product's price and
   * the price-change series all come out chronological. A repeated price on a
   * later date is not a change and is dropped, which keeps the series to the
   * days the price actually moved.
   */
  private collapseUnknownProducts(
    perSheet: {
      date: string;
      details: UnmatchedDetail[];
    }[],
  ): UnknownProduct[] {
    const byLabel = new Map<string, UnknownProduct>();

    for (const { date, details } of [...perSheet].sort((a, b) =>
      a.date.localeCompare(b.date),
    )) {
      // One sheet names a label on several rows only when the bakery splits a
      // product across pages; the first row is the one that describes it.
      const seenThisSheet = new Set<string>();
      for (const { label, price, page, section } of details) {
        const key = label.toLowerCase();
        if (seenThisSheet.has(key)) continue;
        seenThisSheet.add(key);

        const existing = byLabel.get(key);
        if (!existing) {
          byLabel.set(key, {
            label,
            price,
            page,
            suggestedType: suggestedTypeFor(page, section),
            occurrences: 1,
            firstSeen: date,
            priceChanges: [{ price, effectiveAt: date }],
          });
          continue;
        }
        existing.occurrences += 1;
        const last = existing.priceChanges[existing.priceChanges.length - 1];
        if (Math.round(last.price * 100) !== Math.round(price * 100)) {
          existing.priceChanges.push({ price, effectiveAt: date });
        }
      }
    }

    return [...byLabel.values()];
  }

  /**
   * Refuses unless every unknown label is either being created or knowingly
   * skipped, and every requested creation names a label the workbook contains.
   *
   * The second half guards a stale preview: an operator confirms a set of
   * labels, then uploads a different file. Creating products for labels this
   * workbook never mentions would quietly pollute the catalog.
   */
  private assertUnknownLabelsResolved(
    unknownProducts: UnknownProduct[],
    createProducts: CreateProductRequest[],
    acknowledgeUnmatched: string[],
  ): void {
    const known = new Set(unknownProducts.map((u) => u.label.toLowerCase()));

    const notInFile = createProducts
      .map((c) => c.label)
      .filter((label) => !known.has(label.trim().toLowerCase()));
    if (notInFile.length > 0) {
      throw new ConflictException(
        `Cannot create ${notInFile.map((l) => `"${l}"`).join(', ')}: ` +
          `${notInFile.length > 1 ? 'those labels are' : 'that label is'} not ` +
          `an unmatched name in this workbook. Re-run the preview against the ` +
          `file you are importing.`,
      );
    }

    const resolved = new Set([
      ...createProducts.map((c) => c.label.trim().toLowerCase()),
      ...acknowledgeUnmatched.map((l) => l.trim().toLowerCase()),
    ]);
    const unresolved = unknownProducts
      .filter((u) => !resolved.has(u.label.toLowerCase()))
      .map((u) => u.label);

    if (unresolved.length > 0) {
      throw new ConflictException(
        `${unresolved.length} sheet label${unresolved.length > 1 ? 's match' : ' matches'} ` +
          `no product: ${unresolved.map((l) => `"${l}"`).join(', ')}. ` +
          `Create ${unresolved.length > 1 ? 'them' : 'it'} from the import ` +
          `preview, or acknowledge ${unresolved.length > 1 ? 'them' : 'it'} to ` +
          `import without ${unresolved.length > 1 ? 'those products' : 'that product'}.`,
      );
    }
  }

  /**
   * Creates one Product per requested label, plus its observed price history.
   *
   * Name and price come from the workbook, never from the caller — only the
   * type is the operator's to choose. That keeps the created product
   * guaranteed to match the label that asked for it.
   *
   * A label seen at several prices is one product that was repriced, so the
   * extra prices become ProductPriceHistory rows. Without them
   * getEffectivePrice() would fall back to Product.price and resolve an old
   * sheet against a modern price.
   */
  private async createProductsForLabels(
    unknownProducts: UnknownProduct[],
    createProducts: CreateProductRequest[],
  ): Promise<void> {
    const byLabel = new Map(
      unknownProducts.map((u) => [u.label.toLowerCase(), u]),
    );

    await this.prisma.$transaction(async (tx) => {
      // sortOrder is per type, so the next slot has to be read per type and
      // advanced locally for a batch that adds several of the same type.
      const nextSortOrder = new Map<ProductType, number>();

      for (const request of createProducts) {
        const unknown = byLabel.get(request.label.trim().toLowerCase())!;
        const type = request.type;

        let sortOrder = nextSortOrder.get(type);
        if (sortOrder === undefined) {
          const agg = await tx.product.aggregate({
            where: { type, deletedAt: null },
            _max: { sortOrder: true },
          });
          sortOrder = (agg._max.sortOrder ?? 0) + 1;
        }
        nextSortOrder.set(type, sortOrder + 1);

        const product = await tx.product.create({
          data: {
            name: unknown.label,
            type,
            price: unknown.price,
            sortOrder,
            date: new Date(`${unknown.firstSeen}T00:00:00.000Z`),
          },
        });

        await tx.productPriceHistory.createMany({
          data: unknown.priceChanges.map((c) => ({
            productId: product.id,
            price: c.price,
            effectiveAt: new Date(`${c.effectiveAt}T00:00:00.000Z`),
          })),
        });
      }
    });
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
          // The sheet is the source of truth for the day, opening stock
          // included: `counts.quantity` is the sheet's own "Yesterday LO", so
          // computeSold() reproduces its "PCS SOLD Today" column exactly.
          // isAutoGenerated flips so the leftover recascade never treats an
          // imported row as a placeholder it may overwrite.
          update: { ...counts, isAutoGenerated: false },
          create: { branchId, productId, date: sheetDate, ...counts },
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

    const resolver = await this.buildResolver();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheets: DryRunSheet[] = [];
    const unknownsPerSheet: {
      date: string;
      details: UnmatchedDetail[];
    }[] = [];

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
          ambiguous: [],
          error: 'Could not determine date from column headers',
        });
        continue;
      }

      if (dateMeta.sheetDate.getUTCFullYear() < MIN_PLAUSIBLE_YEAR) {
        sheets.push({
          sheetName,
          date: '',
          matched: 0,
          unmatchedCount: 0,
          unmatched: [],
          ambiguous: [],
          error:
            `Sheet date ${toDateStr(dateMeta.sheetDate)} is implausible ` +
            `(unused template tab); sheet will be skipped`,
        });
        continue;
      }

      const { accumulator, unmatched, unmatchedDetails, ambiguous } =
        this.collectSheetEntries(
          rows,
          dateMeta.dateKey,
          resolver,
          dateMeta.sheetDate,
        );
      unknownsPerSheet.push({
        date: toDateStr(dateMeta.sheetDate),
        details: unmatchedDetails,
      });
      const distinct = [...new Set(unmatched)];
      const allZero = accumulator.size > 0 && !hasNonZeroCounts(accumulator);
      const sheetEntry: DryRunSheet = {
        sheetName,
        date: toDateStr(dateMeta.sheetDate),
        matched: accumulator.size,
        unmatchedCount: distinct.length,
        unmatched: distinct,
        ambiguous,
      };
      // Ambiguity aborts the whole sheet at import time — the preview must
      // say so as visibly as the implausible-date/all-zero cases do, or an
      // operator can approve an import that silently drops the sheet.
      if (ambiguous.length > 0) {
        sheetEntry.error =
          `${ambiguous.length} label${ambiguous.length > 1 ? 's are' : ' is'} ` +
          `ambiguous; this sheet will be skipped entirely at import until a ` +
          `ProductAlias resolves ${ambiguous.length > 1 ? 'each label' : 'it'}.`;
      } else if (allZero) {
        sheetEntry.error =
          'All product counts are zero; sheet will be skipped so ' +
          'existing data is not overwritten';
      }
      sheets.push(sheetEntry);
    }

    if (branchId !== undefined) {
      const existingByDate = await this.fetchExistingByDate(
        branchId,
        sheets
          .filter((s) => s.date)
          .map((s) => new Date(`${s.date}T00:00:00.000Z`)),
      );
      for (const sheet of sheets) {
        const existing = sheet.date && existingByDate.get(sheet.date);
        if (existing) sheet.existing = existing;
      }
    }

    const datesDetected = sheets.filter((s) => s.date).map((s) => s.date);
    const totalMatched = sheets.reduce((sum, s) => sum + s.matched, 0);
    const totalUnmatched = sheets.reduce((sum, s) => sum + s.unmatchedCount, 0);
    const totalAmbiguous = sheets.reduce(
      (sum, s) => sum + s.ambiguous.length,
      0,
    );

    return {
      fileName: originalName,
      branch,
      alreadyImported,
      summary: {
        totalSheets: sheets.length,
        totalMatched,
        totalUnmatched,
        totalAmbiguous,
        datesDetected,
      },
      sheets,
      unknownProducts: this.collapseUnknownProducts(unknownsPerSheet),
    };
  }

  async importWorkbook(
    buffer: Buffer,
    branchId: number,
    originalName: string,
    userId?: number,
    conflictMode: ImportConflictMode = 'skip',
    createProducts: CreateProductRequest[] = [],
    acknowledgeUnmatched: string[] = [],
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

    let resolver = await this.buildResolver();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetResults: SheetImportResult[] = [];
    const blockedLabels = new Set<string>();

    // First pass: parse every day sheet so the existing-row check for all
    // dates can be answered with a single batched query.
    const parsedSheets = workbook.SheetNames.filter(isDaySheet).map(
      (sheetName) => {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          workbook.Sheets[sheetName],
          { defval: null, raw: false },
        );
        return { sheetName, rows, dateMeta: this.extractSheetDate(rows) };
      },
    );
    const existingByDate = await this.fetchExistingByDate(
      branchId,
      parsedSheets
        .filter(
          (p) =>
            p.dateMeta &&
            p.dateMeta.sheetDate.getUTCFullYear() >= MIN_PLAUSIBLE_YEAR,
        )
        .map((p) => p.dateMeta!.sheetDate),
    );

    // Every label that resolves to nothing must be accounted for before a
    // single row is written — either the operator asked for it to become a
    // product, or they explicitly acknowledged skipping it. The check lives
    // here rather than only in the UI because the Flutter client and plain
    // curl never see a disabled button, and the failure it prevents is
    // silent: an unmatched label loses that product's data for the whole file
    // while the summary still reports a cheerful success.
    const importableSheets = parsedSheets.filter(
      (p) =>
        p.dateMeta && p.dateMeta.sheetDate.getUTCFullYear() >= MIN_PLAUSIBLE_YEAR,
    );
    const unknownProducts = this.collapseUnknownProducts(
      importableSheets.map((p) => ({
        date: toDateStr(p.dateMeta!.sheetDate),
        details: this.collectSheetEntries(
          p.rows,
          p.dateMeta!.dateKey,
          resolver,
          p.dateMeta!.sheetDate,
        ).unmatchedDetails,
      })),
    );

    if (createProducts.length > 0 || unknownProducts.length > 0) {
      this.assertUnknownLabelsResolved(
        unknownProducts,
        createProducts,
        acknowledgeUnmatched,
      );
    }

    if (createProducts.length > 0) {
      await this.createProductsForLabels(unknownProducts, createProducts);
      // The catalog changed, so the labels that triggered the creation now
      // resolve. Everything downstream must see the new products.
      resolver = await this.buildResolver();
    }

    for (const { sheetName, rows, dateMeta } of parsedSheets) {
      const result: SheetImportResult = {
        sheetName,
        date: '',
        processed: 0,
        skipped: 0,
        errors: [],
      };

      if (!dateMeta) {
        result.errors.push('Could not determine date from column headers');
        sheetResults.push(result);
        continue;
      }

      if (dateMeta.sheetDate.getUTCFullYear() < MIN_PLAUSIBLE_YEAR) {
        result.errors.push(
          `Sheet date ${toDateStr(dateMeta.sheetDate)} is implausible ` +
            `(unused template tab); sheet skipped`,
        );
        sheetResults.push(result);
        continue;
      }

      result.date = toDateStr(dateMeta.sheetDate);

      const existing = existingByDate.get(result.date);
      if (existing && existing.real > 0 && conflictMode !== 'overwrite') {
        result.errors.push(
          `${result.date} already has existing data for this branch ` +
            `(${existing.real} rows); sheet skipped — import with ` +
            `"overwrite" to replace it`,
        );
        sheetResults.push(result);
        continue;
      }

      const { accumulator, unmatched, ambiguous, ambiguousLabels } =
        this.collectSheetEntries(
          rows,
          dateMeta.dateKey,
          resolver,
          dateMeta.sheetDate,
        );
      if (ambiguous.length > 0) {
        for (const label of ambiguousLabels) blockedLabels.add(label);
        for (const reason of ambiguous) result.errors.push(reason);
        result.errors.push(
          `${result.date}: sheet skipped — resolve the ambiguous labels with ` +
            `a ProductAlias before importing`,
        );
        sheetResults.push(result);
        continue;
      }
      result.skipped = unmatched.length;
      for (const name of unmatched) {
        result.errors.push(`Product not found: "${name}"`);
      }
      if (accumulator.size > 0 && !hasNonZeroCounts(accumulator)) {
        result.errors.push(
          'All product counts are zero; sheet skipped so existing data ' +
            'is not overwritten',
        );
        sheetResults.push(result);
        continue;
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

    // Blocking ambiguity server-side, not just in the UI: page.tsx disables
    // its buttons, but the Flutter client and plain curl never see them. When
    // ambiguity is the reason nothing at all was written, the caller gets a
    // hard error naming what to fix rather than a cheerful zero-row summary.
    // A partial import is left alone — it really did write rows, and must
    // still be recorded.
    if (blockedLabels.size > 0 && totalProcessed === 0) {
      throw new ConflictException(
        `Nothing was imported: no label could be resolved to exactly one ` +
          `product. Ambiguous label${blockedLabels.size > 1 ? 's' : ''}: ` +
          `${[...blockedLabels].map((l) => `"${l}"`).join(', ')}. ` +
          `Add a ProductAlias row for each (section "bote" for bottle ` +
          `deposits, priceHint to separate same-named SKUs) and upload again.`,
      );
    }

    // Nothing was written, so nothing may be recorded as an import. Writing an
    // ImportLog here would burn this file's SHA-256 and the hash guard above
    // would then reject the corrected re-run forever — recovery needs
    // DELETE /logs/:id, which is ADMIN while import is MANAGER.
    if (totalProcessed === 0) {
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
