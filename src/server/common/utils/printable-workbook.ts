/**
 * Writes a SheetJS workbook as a printable, formatted .xlsx.
 *
 * The workbook builders (inventory, payroll) stay pure SheetJS: values,
 * formulas with their computed results, number formats, merges and column
 * widths, all unit-tested as they are. SheetJS community cannot write cell
 * styles or page setup, so each builder also describes its sheet's layout
 * here (which rows are titles, headers, bodies, totals; how the page prints),
 * and this module writes the file through ExcelJS with those styles applied.
 *
 * The look follows the client's paper sheets: bold spaced title, bold
 * bordered headers, thin grid on the body, totals set off by a heavier rule,
 * landscape and one page wide.
 */
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

/** Named looks; a builder says which rows get which, never raw styles. */
export type CellLook =
  | 'title' //        P A Y R O L L — large, bold, centred
  | 'heading' //      a sheet's own heading line (branch, period)
  | 'headingRight' // the same, set against the right edge
  | 'emphasis' //     bold body text (the company name in a sentence, key labels)
  | 'section' //      a category band above a table (BREAD, CAKE…)
  | 'header' //       column headings
  | 'headerAccent' // column headings the paper sheet fills in blue
  | 'body' //         table cells: thin grid
  | 'bodyStrong' //   table cells in a bold column (name, gross, net)
  | 'muted' //        notes in a table (Not counted, Equipment)
  | 'changed' //      a figure that differs from the reference (a day's own price)
  | 'total' //        a total row: bold, heavier rule above
  | 'grandTotal' //   the last total: bold, double rule, tinted
  | 'signName' //     a signatory's name: bold, centred
  | 'signNote'; //    the line under it: centred

/** 1-based rows, 0-based columns (as the builders write), both ends included. */
export interface Region {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}

export interface SheetLayout {
  looks: Array<Region & { look: CellLook }>;
  /** Boxes drawn with a medium outer border (a table's frame). */
  frames?: Region[];
  /** Row heights in points, by 1-based row. */
  rowHeights?: Record<number, number>;
  page: {
    orientation: 'landscape' | 'portrait';
    paper: 'letter' | 'legal' | 'a4';
    /** Rows repeated at the top of every printed page, 1-based. */
    repeatRows?: [number, number];
    /** Left / centre / right page header text (Excel codes like &P allowed). */
    header?: [string, string, string];
    footer?: [string, string, string];
    /** Freeze the window below this row and right of this column (screen only). */
    freeze?: { rows: number; cols: number };
  };
}

const layouts = new WeakMap<XLSX.WorkSheet, SheetLayout>();

/** Attach a layout to a sheet a builder made. */
export function setLayout(ws: XLSX.WorkSheet, layout: SheetLayout): void {
  layouts.set(ws, layout);
}

export function layoutOf(ws: XLSX.WorkSheet): SheetLayout | undefined {
  return layouts.get(ws);
}

const INK = 'FF1F1F1F';
const GRID = 'FF8C8C8C';
const thin = { style: 'thin' as const, color: { argb: GRID } };
const medium = { style: 'medium' as const, color: { argb: INK } };
const double = { style: 'double' as const, color: { argb: INK } };
const grid: Partial<ExcelJS.Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

type Look = Partial<Pick<ExcelJS.Style, 'font' | 'fill' | 'border' | 'alignment'>>;

const LOOKS: Record<CellLook, Look> = {
  title: { font: { name: 'Arial', size: 18, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' } },
  heading: { font: { name: 'Arial', size: 11, bold: true } },
  headingRight: { font: { name: 'Arial', size: 10, bold: true }, alignment: { horizontal: 'right' } },
  emphasis: { font: { name: 'Arial', size: 10, bold: true } },
  section: {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF7A3E00' } },
    fill: fill('FFFBE5D0'),
    border: { top: thin, bottom: thin },
  },
  header: {
    font: { name: 'Arial', size: 9, bold: true },
    fill: fill('FFF2F2F2'),
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: grid,
  },
  headerAccent: {
    font: { name: 'Arial', size: 9, bold: true },
    fill: fill('FFBDD7EE'),
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: grid,
  },
  body: { font: { name: 'Arial', size: 9 }, border: grid },
  bodyStrong: { font: { name: 'Arial', size: 9, bold: true }, border: grid },
  changed: { font: { name: 'Arial', size: 9, bold: true }, fill: fill('FFFFF2CC'), border: grid },
  muted: { font: { name: 'Arial', size: 8, italic: true, color: { argb: 'FF6B6B6B' } }, border: grid },
  total: {
    font: { name: 'Arial', size: 9, bold: true },
    fill: fill('FFF7F7F7'),
    border: { top: medium, bottom: thin, left: thin, right: thin },
  },
  grandTotal: {
    font: { name: 'Arial', size: 10, bold: true },
    fill: fill('FFFBE5D0'),
    border: { top: medium, bottom: double, left: thin, right: thin },
  },
  signName: { font: { name: 'Arial', size: 10, bold: true }, alignment: { horizontal: 'center' } },
  signNote: { font: { name: 'Arial', size: 9 }, alignment: { horizontal: 'center' } },
};

const PAPER: Record<SheetLayout['page']['paper'], number> = { letter: 1, legal: 5, a4: 9 };

function applyLook(cell: ExcelJS.Cell, look: Look) {
  if (look.font) cell.font = { ...cell.font, ...look.font };
  if (look.fill) cell.fill = look.fill;
  if (look.border) cell.border = { ...cell.border, ...look.border };
  if (look.alignment) cell.alignment = { ...cell.alignment, ...look.alignment };
}

function frame(sheet: ExcelJS.Worksheet, r: Region) {
  for (let row = r.r1; row <= r.r2; row++) {
    for (let c = r.c1; c <= r.c2; c++) {
      const cell = sheet.getCell(row, c + 1);
      const b = { ...cell.border };
      if (row === r.r1) b.top = medium;
      if (row === r.r2) b.bottom = b.bottom?.style === 'double' ? b.bottom : medium;
      if (c === r.c1) b.left = medium;
      if (c === r.c2) b.right = medium;
      cell.border = b;
    }
  }
}

/** Copy a SheetJS sheet's content (values, formulas + results, formats, merges, widths). */
function copyContent(ws: XLSX.WorkSheet, sheet: ExcelJS.Worksheet) {
  for (const [addr, raw] of Object.entries(ws)) {
    if (addr.startsWith('!')) continue;
    const c = raw as XLSX.CellObject;
    const { r, c: col } = XLSX.utils.decode_cell(addr);
    const cell = sheet.getCell(r + 1, col + 1);
    if (c.f) {
      cell.value = { formula: c.f, result: c.v as number | string | undefined } as ExcelJS.CellFormulaValue;
    } else if (c.t === 'n' || c.t === 's' || c.t === 'b') {
      cell.value = c.v as number | string | boolean;
    }
    if (c.z) cell.numFmt = String(c.z);
    // Numbers and formulas sit right, as on paper; text left.
    if (c.t === 'n') cell.alignment = { ...cell.alignment, horizontal: 'right' };
  }
  for (const m of ws['!merges'] ?? []) sheet.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
  (ws['!cols'] ?? []).forEach((colInfo, i) => {
    if (colInfo?.wch) sheet.getColumn(i + 1).width = colInfo.wch + 1;
  });
}

/** The workbook as a formatted, print-ready .xlsx. Sheets without a layout are copied plain. */
export async function writePrintableWorkbook(wb: XLSX.WorkBook): Promise<Buffer> {
  const out = new ExcelJS.Workbook();
  out.creator = 'Louella';
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const layout = layoutOf(ws);
    const sheet = out.addWorksheet(name);
    copyContent(ws, sheet);
    if (!layout) continue;

    for (const { look, ...r } of layout.looks) {
      for (let row = r.r1; row <= r.r2; row++) {
        for (let c = r.c1; c <= r.c2; c++) applyLook(sheet.getCell(row, c + 1), LOOKS[look]);
      }
    }
    for (const r of layout.frames ?? []) frame(sheet, r);
    for (const [row, height] of Object.entries(layout.rowHeights ?? {})) sheet.getRow(Number(row)).height = height;

    const { page } = layout;
    sheet.pageSetup = {
      ...sheet.pageSetup,
      orientation: page.orientation,
      paperSize: PAPER[page.paper] as ExcelJS.PageSetup['paperSize'],
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      // ExcelJS writes the print-titles name as '<sheet>'!$1:$1 without doubling a quote
      // inside the sheet name, which Excel then has to repair ("LOUELLA'S BAKESHOP").
      // A sheet whose name has one prints without repeated rows instead.
      ...(page.repeatRows && !name.includes("'") ? { printTitlesRow: `${page.repeatRows[0]}:${page.repeatRows[1]}` } : {}),
    };
    const hf = (parts?: [string, string, string]) =>
      parts ? `&L${parts[0]}&C${parts[1]}&R${parts[2]}` : undefined;
    sheet.headerFooter = {
      ...(page.header ? { oddHeader: hf(page.header) } : {}),
      ...(page.footer ? { oddFooter: hf(page.footer) } : {}),
    };
    if (page.freeze) {
      sheet.views = [{ state: 'frozen', ySplit: page.freeze.rows, xSplit: page.freeze.cols, showGridLines: false }];
    } else {
      sheet.views = [{ showGridLines: false }];
    }
  }
  return Buffer.from(await out.xlsx.writeBuffer());
}
