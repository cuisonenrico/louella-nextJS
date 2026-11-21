import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { setLayout, writePrintableWorkbook } from './printable-workbook';

/** A two-row table: header, one line, a total with a formula. */
function sample() {
  const ws: XLSX.WorkSheet = {
    A1: { t: 's', v: 'TITLE' },
    A2: { t: 's', v: 'ITEM' },
    B2: { t: 's', v: 'AMOUNT' },
    A3: { t: 's', v: 'Pandesal' },
    B3: { t: 'n', v: 1234.5, z: '#,##0.00' },
    A4: { t: 's', v: 'TOTAL' },
    B4: { t: 'n', f: 'SUM(B3:B3)', v: 1234.5, z: '#,##0.00' },
    '!ref': 'A1:B4',
    '!merges': [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }],
    '!cols': [{ wch: 20 }, { wch: 12 }],
  };
  setLayout(ws, {
    looks: [
      { r1: 1, r2: 1, c1: 0, c2: 1, look: 'title' },
      { r1: 2, r2: 2, c1: 0, c2: 1, look: 'header' },
      { r1: 3, r2: 3, c1: 0, c2: 1, look: 'body' },
      { r1: 4, r2: 4, c1: 0, c2: 1, look: 'grandTotal' },
    ],
    frames: [{ r1: 2, r2: 4, c1: 0, c2: 1 }],
    page: { orientation: 'landscape', paper: 'legal', repeatRows: [2, 2], footer: ['Left', 'Mid', 'Page &P of &N'] },
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet A');
  return wb;
}

async function readBack(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.getWorksheet('Sheet A')!;
}

describe('writePrintableWorkbook', () => {
  it('keeps values, formulas with their results, formats, merges and widths', async () => {
    const buffer = await writePrintableWorkbook(sample());
    const back = XLSX.read(buffer, { type: 'buffer' }).Sheets['Sheet A'];
    expect(back.B3.v).toBe(1234.5);
    expect(back.B4.f).toBe('SUM(B3:B3)');
    expect(back.B4.v).toBe(1234.5); // previews that never recalculate still show it
    const sheet = await readBack(buffer);
    expect(sheet.getCell('B3').numFmt).toBe('#,##0.00');
    expect(sheet.getCell('A1').isMerged).toBe(true);
    expect(sheet.getColumn(1).width).toBe(21);
  });

  it('styles each row by its role', async () => {
    const sheet = await readBack(await writePrintableWorkbook(sample()));
    expect(sheet.getCell('A1').font.bold).toBe(true);
    expect(sheet.getCell('A1').font.size).toBe(18);
    expect(sheet.getCell('A2').font.bold).toBe(true);
    expect(sheet.getCell('A2').border.bottom?.style).toBe('thin');
    expect(sheet.getCell('A3').font.bold).toBeFalsy();
    expect(sheet.getCell('B4').border.bottom?.style).toBe('double');
    // The frame: a medium outer edge around the table.
    expect(sheet.getCell('A2').border.top?.style).toBe('medium');
    expect(sheet.getCell('A3').border.left?.style).toBe('medium');
    expect(sheet.getCell('B3').border.right?.style).toBe('medium');
  });

  it('sets the page up to print: landscape, legal, one page wide, header row repeated, page numbers', async () => {
    const sheet = await readBack(await writePrintableWorkbook(sample()));
    expect(sheet.pageSetup.orientation).toBe('landscape');
    expect(sheet.pageSetup.paperSize).toBe(5);
    expect(sheet.pageSetup.fitToPage).toBe(true);
    expect(sheet.pageSetup.fitToWidth).toBe(1);
    expect(sheet.pageSetup.fitToHeight).toBe(0);
    expect(sheet.pageSetup.printTitlesRow).toBe('2:2');
    expect(sheet.headerFooter.oddFooter).toBe('&LLeft&CMid&RPage &P of &N');
  });

  it('leaves out repeated rows for a sheet named with an apostrophe, so Excel opens it without repair', async () => {
    const wb = sample();
    wb.SheetNames = ["LOUELLA'S BAKESHOP"];
    wb.Sheets = { "LOUELLA'S BAKESHOP": wb.Sheets['Sheet A'] };
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await writePrintableWorkbook(wb)) as unknown as ArrayBuffer);
    const sheet = book.getWorksheet("LOUELLA'S BAKESHOP")!;
    expect(sheet.pageSetup.printTitlesRow).toBeUndefined();
    expect(sheet.pageSetup.orientation).toBe('landscape');
  });

  it('copies a sheet with no layout as it is', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a', 1]]), 'Plain');
    const back = XLSX.read(await writePrintableWorkbook(wb), { type: 'buffer' });
    expect(XLSX.utils.sheet_to_json(back.Sheets.Plain, { header: 1 })).toEqual([['a', 1]]);
  });
});
