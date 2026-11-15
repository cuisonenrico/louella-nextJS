/**
 * The branch inventory workbook: one sheet per day in the style of the paper
 * sheet the bakery used (`Oct30-Nov13-2026.xlsx`), then a Summary sheet.
 *
 * Pure: it takes plain figures and returns a SheetJS workbook, so the layout
 * is unit-tested without a database.
 *
 * Every sum and product is an Excel formula, as on the paper sheet, so a cell
 * edited in Excel recalculates the rest. Each formula also carries the value
 * computed here, so viewers that never recalculate (phone previews, Google
 * Drive's preview) still show the right figures.
 *
 * Prices are the products' **current** prices on every day, by request, so a
 * past day here can differ from the sales page, which prices each day as it
 * was. Sold follows the app: a leftover nobody counted sells nothing, so its
 * leftover cell holds the derived close (opening + delivery + in − out −
 * reject) and the row is marked "Not counted".
 */
import * as XLSX from 'xlsx';
import { centavos, pesos } from '../common/utils/decimal.util';

export type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';

export const TYPE_ORDER: ProductType[] = ['BREAD', 'CAKE', 'SPECIAL', 'MISCELLANEOUS'];
const TYPE_LABELS: Record<ProductType, string> = {
  BREAD: 'BREAD',
  CAKE: 'CAKE',
  SPECIAL: 'SPECIAL',
  MISCELLANEOUS: 'MISCELLANEOUS',
};

export interface WorkbookProduct {
  id: number;
  name: string;
  type: ProductType;
  /** Current price, used on every day. */
  price: number;
}

export interface WorkbookRow {
  productId: number;
  /** Opening = yesterday's close. */
  opening: number;
  delivery: number;
  pullIn: number;
  pullOut: number;
  /** Null when nobody has counted the leftover. */
  leftover: number | null;
  reject: number;
}

export interface WorkbookCash {
  expenses: number;
  vale: number;
  /** Counted cash; null until counted. */
  actualCash: number | null;
  status: 'OPEN' | 'VERIFIED';
}

export interface WorkbookDay {
  /** YYYY-MM-DD */
  date: string;
  rows: WorkbookRow[];
  cash: WorkbookCash;
}

export interface WorkbookInput {
  branchName: string;
  from: string;
  to: string;
  /** Manila date the prices were read on. */
  pricedOn: string;
  /** Already ordered within each type; grouped here by `TYPE_ORDER`. */
  products: WorkbookProduct[];
  days: WorkbookDay[];
}

const PESO = '#,##0.00;[Red]-#,##0.00';
const COUNT = '0;[Red]-0';
const DATE = 'mm-dd-yy';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-10-30" → "Oct 30": the day sheet's tab name. */
export function sheetNameFor(date: string): string {
  const [, m, d] = date.split('-');
  return `${MONTHS[Number(m) - 1]} ${d}`;
}

/** Excel's serial for a calendar date (1900 system), so date cells stay dates. */
function serial(date: string): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000 + 25_569;
}

const money = (n: number) => pesos(centavos(n));
const times = (price: number, qty: number) => money(price * qty);

/** Per-row figures, the same ones the formulas compute. */
export function rowFigures(row: WorkbookRow | undefined, price: number) {
  const opening = row?.opening ?? 0;
  const delivery = row?.delivery ?? 0;
  const pullIn = row?.pullIn ?? 0;
  const pullOut = row?.pullOut ?? 0;
  const reject = row?.reject ?? 0;
  const counted = row ? row.leftover !== null : true;
  const leftover = row && row.leftover !== null ? row.leftover : opening + delivery + pullIn - pullOut - reject;
  const sold = opening + delivery + pullIn - pullOut - leftover - reject;
  return { opening, delivery, pullIn, pullOut, reject, leftover, sold, counted, sales: times(price, sold) };
}

type Cell = XLSX.CellObject;
const text = (v: string): Cell => ({ t: 's', v });
const number = (v: number, z?: string): Cell => ({ t: 'n', v, ...(z ? { z } : {}) });
const formula = (f: string, v: number, z?: string): Cell => ({ t: 'n', f, v, ...(z ? { z } : {}) });

/** A sparse sheet writer: `put(row, col, cell)` with 1-based rows and 0-based columns. */
class SheetBuilder {
  readonly ws: XLSX.WorkSheet = {};
  private maxRow = 1;
  private maxCol = 0;

  put(row: number, col: number, cell: Cell | undefined) {
    if (!cell) return;
    this.ws[XLSX.utils.encode_cell({ r: row - 1, c: col })] = cell;
    this.maxRow = Math.max(this.maxRow, row);
    this.maxCol = Math.max(this.maxCol, col);
  }

  finish(widths: number[]): XLSX.WorkSheet {
    this.ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.maxRow - 1, c: this.maxCol } });
    this.ws['!cols'] = widths.map((wch) => ({ wch }));
    return this.ws;
  }
}

const col = (c: number) => XLSX.utils.encode_col(c);

// Day sheet columns. A–J follow the paper sheet; K–N are what the app knows that paper did not.
const C = {
  product: 0, price: 1, delivery: 2, deliveryP: 3, leftover: 4, leftoverP: 5, reject: 6, rejectP: 7,
  sold: 8, opening: 9, pullIn: 10, pullOut: 11, sales: 12, note: 13,
} as const;
const DAY_HEADERS = [
  'PRODUCTS', 'PRICES', 'DELIVERY', 'TOTAL', 'LEFTOVER', 'TOTAL', 'REJECT', 'TOTAL',
  'PCS SOLD', 'YESTERDAY LO', 'PULL IN', 'PULL OUT', 'SALES', 'NOTE',
];
const DAY_WIDTHS = [28, 9, 10, 11, 10, 11, 9, 10, 10, 13, 9, 10, 12, 12];

function groupProducts(products: WorkbookProduct[]) {
  return TYPE_ORDER.map((type) => ({ type, products: products.filter((p) => p.type === type) })).filter(
    (g) => g.products.length > 0,
  );
}

interface CategoryTotals {
  type: ProductType;
  /** Row number of the category's TOTAL row on the day sheet. */
  totalRow: number;
  first: number;
  last: number;
  openingP: number;
  deliveryP: number;
  pullInP: number;
  pullOutP: number;
  rejectP: number;
  leftoverP: number;
  sales: number;
}

/** Where the Summary sheet reads a day's cash figures from. */
interface DayCells {
  sheet: string;
  sales: string;
  expenses: string;
  vale: string;
  expected: string;
  actual: string;
  overShort: string;
}

function buildDaySheet(input: WorkbookInput, day: WorkbookDay) {
  const s = new SheetBuilder();
  const rowsById = new Map(day.rows.map((r) => [r.productId, r]));

  s.put(1, 0, text(`BRANCH: ${input.branchName}`));
  s.put(1, 5, text('DATE:'));
  s.put(1, 6, number(serial(day.date), DATE));

  let r = 3;
  const categories: CategoryTotals[] = [];
  for (const group of groupProducts(input.products)) {
    s.put(r, 0, text(TYPE_LABELS[group.type]));
    r += 1;
    DAY_HEADERS.forEach((h, c) => s.put(r, c, text(h)));
    r += 1;

    const first = r;
    const acc = { openingP: 0, deliveryP: 0, pullInP: 0, pullOutP: 0, rejectP: 0, leftoverP: 0, sales: 0 };
    for (const p of group.products) {
      const row = rowsById.get(p.id);
      const f = rowFigures(row, p.price);
      const ref = (c: number) => `${col(c)}${r}`;
      s.put(r, C.product, text(p.name));
      s.put(r, C.price, number(p.price, PESO));
      if (row) {
        s.put(r, C.delivery, number(f.delivery));
        s.put(r, C.leftover, number(f.leftover));
        s.put(r, C.reject, number(f.reject));
        s.put(r, C.opening, number(f.opening));
        s.put(r, C.pullIn, number(f.pullIn));
        s.put(r, C.pullOut, number(f.pullOut));
        if (!f.counted) s.put(r, C.note, text('Not counted'));
      }
      s.put(r, C.deliveryP, formula(`${ref(C.price)}*${ref(C.delivery)}`, times(p.price, f.delivery), PESO));
      s.put(r, C.leftoverP, formula(`${ref(C.price)}*${ref(C.leftover)}`, times(p.price, f.leftover), PESO));
      s.put(r, C.rejectP, formula(`${ref(C.price)}*${ref(C.reject)}`, times(p.price, f.reject), PESO));
      s.put(
        r,
        C.sold,
        formula(
          `${ref(C.opening)}+${ref(C.delivery)}+${ref(C.pullIn)}-${ref(C.pullOut)}-${ref(C.leftover)}-${ref(C.reject)}`,
          f.sold,
          COUNT,
        ),
      );
      s.put(r, C.sales, formula(`${ref(C.price)}*${ref(C.sold)}`, f.sales, PESO));

      acc.openingP += centavos(times(p.price, f.opening));
      acc.deliveryP += centavos(times(p.price, f.delivery));
      acc.pullInP += centavos(times(p.price, f.pullIn));
      acc.pullOutP += centavos(times(p.price, f.pullOut));
      acc.rejectP += centavos(times(p.price, f.reject));
      acc.leftoverP += centavos(times(p.price, f.leftover));
      acc.sales += centavos(f.sales);
      r += 1;
    }
    const last = r - 1;

    s.put(r, 0, text('TOTAL'));
    const sumOf = (c: number, v: number, z: string) =>
      s.put(r, c, formula(`SUM(${col(c)}${first}:${col(c)}${last})`, v, z));
    const counts = group.products.map((p) => rowFigures(rowsById.get(p.id), p.price));
    sumOf(C.delivery, counts.reduce((n, f) => n + f.delivery, 0), COUNT);
    sumOf(C.deliveryP, pesos(acc.deliveryP), PESO);
    sumOf(C.leftover, counts.reduce((n, f) => n + f.leftover, 0), COUNT);
    sumOf(C.leftoverP, pesos(acc.leftoverP), PESO);
    sumOf(C.reject, counts.reduce((n, f) => n + f.reject, 0), COUNT);
    sumOf(C.rejectP, pesos(acc.rejectP), PESO);
    sumOf(C.sold, counts.reduce((n, f) => n + f.sold, 0), COUNT);
    sumOf(C.opening, counts.reduce((n, f) => n + f.opening, 0), COUNT);
    sumOf(C.pullIn, counts.reduce((n, f) => n + f.pullIn, 0), COUNT);
    sumOf(C.pullOut, counts.reduce((n, f) => n + f.pullOut, 0), COUNT);
    sumOf(C.sales, pesos(acc.sales), PESO);

    categories.push({
      type: group.type, totalRow: r, first, last,
      openingP: pesos(acc.openingP), deliveryP: pesos(acc.deliveryP), pullInP: pesos(acc.pullInP),
      pullOutP: pesos(acc.pullOutP), rejectP: pesos(acc.rejectP), leftoverP: pesos(acc.leftoverP), sales: pesos(acc.sales),
    });
    r += 2;
  }

  // SUMMARY — one line per category, in pesos at current prices.
  const sumHeaders = ['SUMMARY', 'L/O START', 'DELIVERY', 'PULL IN', 'PULL OUT', 'REJECT', 'L/O END', 'SALES'];
  sumHeaders.forEach((h, c) => s.put(r, c, text(h)));
  r += 1;
  const summaryFirst = r;
  const range = (cat: CategoryTotals, c: number) => `${col(c)}${cat.first}:${col(c)}${cat.last}`;
  const priceRange = (cat: CategoryTotals) => range(cat, C.price);
  for (const cat of categories) {
    s.put(r, 0, text(TYPE_LABELS[cat.type]));
    s.put(r, 1, formula(`SUMPRODUCT(${priceRange(cat)},${range(cat, C.opening)})`, cat.openingP, PESO));
    s.put(r, 2, formula(`${col(C.deliveryP)}${cat.totalRow}`, cat.deliveryP, PESO));
    s.put(r, 3, formula(`SUMPRODUCT(${priceRange(cat)},${range(cat, C.pullIn)})`, cat.pullInP, PESO));
    s.put(r, 4, formula(`SUMPRODUCT(${priceRange(cat)},${range(cat, C.pullOut)})`, cat.pullOutP, PESO));
    s.put(r, 5, formula(`${col(C.rejectP)}${cat.totalRow}`, cat.rejectP, PESO));
    s.put(r, 6, formula(`${col(C.leftoverP)}${cat.totalRow}`, cat.leftoverP, PESO));
    s.put(r, 7, formula(`${col(C.sales)}${cat.totalRow}`, cat.sales, PESO));
    r += 1;
  }
  const summaryLast = r - 1;
  s.put(r, 0, text('TOTAL'));
  const totalOf = (pick: (c: CategoryTotals) => number) =>
    pesos(categories.reduce((n, c) => n + centavos(pick(c)), 0));
  const picks: Array<(c: CategoryTotals) => number> = [
    (c) => c.openingP, (c) => c.deliveryP, (c) => c.pullInP, (c) => c.pullOutP,
    (c) => c.rejectP, (c) => c.leftoverP, (c) => c.sales,
  ];
  picks.forEach((pick, i) => {
    const c = i + 1;
    const f = categories.length ? `SUM(${col(c)}${summaryFirst}:${col(c)}${summaryLast})` : '0';
    s.put(r, c, formula(f, totalOf(pick), PESO));
  });
  const salesCell = `B${r + 2}`;
  const salesTotal = totalOf((c) => c.sales);
  const totalsRow = r;
  r += 2;

  // The bottom of the paper sheet: expected sales, then the drawer.
  const { expenses, vale, actualCash, status } = day.cash;
  const expected = pesos(centavos(salesTotal) - centavos(expenses) - centavos(vale));
  s.put(r, 0, text('EXPECTED SALES (DAPAT BENTA)'));
  s.put(r, 1, formula(`H${totalsRow}`, salesTotal, PESO));
  const cells: DayCells = {
    sheet: sheetNameFor(day.date),
    sales: salesCell,
    expenses: `B${r + 1}`,
    vale: `B${r + 2}`,
    expected: `B${r + 3}`,
    actual: `B${r + 4}`,
    overShort: `B${r + 5}`,
  };
  s.put(r + 1, 0, text('LESS: EXPENSES'));
  s.put(r + 1, 1, number(expenses, PESO));
  s.put(r + 2, 0, text('LESS: VALE'));
  s.put(r + 2, 1, number(vale, PESO));
  s.put(r + 3, 0, text('EXPECTED CASH'));
  s.put(r + 3, 1, formula(`${cells.sales}-${cells.expenses}-${cells.vale}`, expected, PESO));
  s.put(r + 4, 0, text('ACTUAL CASH'));
  if (actualCash !== null) s.put(r + 4, 1, number(actualCash, PESO));
  else s.put(r + 4, 2, text('Not counted'));
  s.put(r + 5, 0, text('SHORT / OVER'));
  if (actualCash !== null) {
    s.put(r + 5, 1, formula(`${cells.actual}-${cells.expected}`, pesos(centavos(actualCash) - centavos(expected)), PESO));
  }
  s.put(r + 6, 0, text('CASH DAY'));
  s.put(r + 6, 1, text(status === 'VERIFIED' ? 'Verified' : 'Open'));

  return { ws: s.finish(DAY_WIDTHS), cells, salesTotal, expected };
}

const SUMMARY_WIDTHS = [28, 9, 10, 9, 10, 9, 10, 13, 13, 13];

function buildSummarySheet(
  input: WorkbookInput,
  days: Array<{ day: WorkbookDay; cells: DayCells; salesTotal: number; expected: number }>,
) {
  const s = new SheetBuilder();
  s.put(1, 0, text(`SUMMARY — BRANCH: ${input.branchName}`));
  s.put(2, 0, text('FROM'));
  s.put(2, 1, number(serial(input.from), DATE));
  s.put(2, 2, text('TO'));
  s.put(2, 3, number(serial(input.to), DATE));
  s.put(3, 0, text(`Prices as of ${input.pricedOn} (current prices on every day)`));

  // Per product, across the range.
  const byProduct = new Map<number, WorkbookRow[]>();
  for (const { day } of days) {
    for (const row of day.rows) {
      const list = byProduct.get(row.productId) ?? [];
      list.push(row);
      byProduct.set(row.productId, list);
    }
  }
  const lastDay = days.at(-1)?.day;
  const lastRows = new Map(lastDay?.rows.map((row) => [row.productId, row]) ?? []);

  const headers = ['PRODUCTS', 'PRICES', 'DELIVERY', 'PULL IN', 'PULL OUT', 'REJECT', 'PCS SOLD', 'SALES', 'LEFTOVER (END)'];
  let r = 5;
  const totalRows: number[] = [];
  for (const group of groupProducts(input.products)) {
    s.put(r, 0, text(TYPE_LABELS[group.type]));
    r += 1;
    headers.forEach((h, c) => s.put(r, c, text(h)));
    r += 1;
    const first = r;
    const acc = { delivery: 0, pullIn: 0, pullOut: 0, reject: 0, sold: 0, sales: 0, leftover: 0 };
    for (const p of group.products) {
      const t = { delivery: 0, pullIn: 0, pullOut: 0, reject: 0, sold: 0, sales: 0 };
      for (const row of byProduct.get(p.id) ?? []) {
        const f = rowFigures(row, p.price);
        t.delivery += f.delivery;
        t.pullIn += f.pullIn;
        t.pullOut += f.pullOut;
        t.reject += f.reject;
        t.sold += f.sold;
        t.sales += centavos(f.sales);
      }
      const endRow = lastRows.get(p.id);
      const leftoverEnd = endRow ? rowFigures(endRow, p.price).leftover : null;
      s.put(r, 0, text(p.name));
      s.put(r, 1, number(p.price, PESO));
      s.put(r, 2, number(t.delivery));
      s.put(r, 3, number(t.pullIn));
      s.put(r, 4, number(t.pullOut));
      s.put(r, 5, number(t.reject));
      s.put(r, 6, number(t.sold, COUNT));
      s.put(r, 7, number(pesos(t.sales), PESO));
      if (leftoverEnd !== null) s.put(r, 8, number(leftoverEnd));
      acc.delivery += t.delivery;
      acc.pullIn += t.pullIn;
      acc.pullOut += t.pullOut;
      acc.reject += t.reject;
      acc.sold += t.sold;
      acc.sales += t.sales;
      acc.leftover += leftoverEnd ?? 0;
      r += 1;
    }
    const last = r - 1;
    s.put(r, 0, text(`${TYPE_LABELS[group.type]} TOTAL`));
    const sum = (c: number, v: number, z?: string) => s.put(r, c, formula(`SUM(${col(c)}${first}:${col(c)}${last})`, v, z));
    sum(2, acc.delivery);
    sum(3, acc.pullIn);
    sum(4, acc.pullOut);
    sum(5, acc.reject);
    sum(6, acc.sold, COUNT);
    sum(7, pesos(acc.sales), PESO);
    sum(8, acc.leftover);
    totalRows.push(r);
    r += 2;
  }

  // Grand total of the category totals.
  if (totalRows.length) {
    s.put(r, 0, text('GRAND TOTAL'));
    for (let c = 2; c <= 8; c++) {
      const f = totalRows.map((tr) => `${col(c)}${tr}`).join('+');
      const v = totalRows.reduce((n, tr) => {
        const cell = s.ws[`${col(c)}${tr}`] as Cell | undefined;
        return n + (c === 7 ? centavos(Number(cell?.v ?? 0)) : Number(cell?.v ?? 0));
      }, 0);
      s.put(r, c, formula(f, c === 7 ? pesos(v) : v, c === 7 ? PESO : c === 6 ? COUNT : undefined));
    }
    r += 3;
  }

  // Per day: the cash block of each day sheet.
  const dayHeaders = ['DATE', 'SALES', 'EXPENSES', 'VALE', 'EXPECTED CASH', 'ACTUAL CASH', 'SHORT / OVER', 'CASH DAY'];
  dayHeaders.forEach((h, c) => s.put(r, c, text(h)));
  r += 1;
  const firstDay = r;
  const acc = { sales: 0, expenses: 0, vale: 0, expected: 0, actual: 0, overShort: 0 };
  for (const { day, cells, salesTotal, expected } of days) {
    const at = (cell: string) => `'${cells.sheet}'!${cell}`;
    const { expenses, vale, actualCash, status } = day.cash;
    s.put(r, 0, number(serial(day.date), DATE));
    s.put(r, 1, formula(at(cells.sales), salesTotal, PESO));
    s.put(r, 2, formula(at(cells.expenses), expenses, PESO));
    s.put(r, 3, formula(at(cells.vale), vale, PESO));
    s.put(r, 4, formula(at(cells.expected), expected, PESO));
    if (actualCash !== null) {
      const overShort = pesos(centavos(actualCash) - centavos(expected));
      s.put(r, 5, formula(at(cells.actual), actualCash, PESO));
      s.put(r, 6, formula(at(cells.overShort), overShort, PESO));
      acc.actual += centavos(actualCash);
      acc.overShort += centavos(overShort);
    } else {
      s.put(r, 5, text('Not counted'));
    }
    s.put(r, 7, text(status === 'VERIFIED' ? 'Verified' : 'Open'));
    acc.sales += centavos(salesTotal);
    acc.expenses += centavos(expenses);
    acc.vale += centavos(vale);
    acc.expected += centavos(expected);
    r += 1;
  }
  const lastDayRow = r - 1;
  s.put(r, 0, text('TOTAL'));
  const daySum = (c: number, v: number) =>
    s.put(r, c, formula(days.length ? `SUM(${col(c)}${firstDay}:${col(c)}${lastDayRow})` : '0', pesos(v), PESO));
  daySum(1, acc.sales);
  daySum(2, acc.expenses);
  daySum(3, acc.vale);
  daySum(4, acc.expected);
  daySum(5, acc.actual);
  daySum(6, acc.overShort);

  return s.finish(SUMMARY_WIDTHS);
}

export function buildInventoryWorkbook(input: WorkbookInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const built = input.days.map((day) => ({ day, ...buildDaySheet(input, day) }));
  for (const b of built) XLSX.utils.book_append_sheet(wb, b.ws, b.cells.sheet);
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(input, built), 'Summary');
  return wb;
}

export function writeInventoryWorkbook(input: WorkbookInput): Buffer {
  return XLSX.write(buildInventoryWorkbook(input), { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
