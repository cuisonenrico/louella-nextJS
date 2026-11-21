import * as ExcelJS from 'exceljs';
import { expect } from '@playwright/test';

/**
 * An exported sheet is set up to print as the paper sheet: landscape, on the given
 * paper, one page wide, with `header` written as a bold, bordered column heading.
 * Read through ExcelJS because SheetJS (used for the figures) does not read styles.
 */
export async function expectPrintable(
  file: Buffer,
  sheet: string,
  { paper, header }: { paper: 'letter' | 'legal'; header: string },
) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(sheet);
  expect(ws, `sheet "${sheet}"`).toBeDefined();
  expect(ws!.pageSetup).toMatchObject({
    orientation: 'landscape',
    paperSize: paper === 'legal' ? 5 : 1,
    fitToPage: true,
    fitToWidth: 1,
  });
  let found: ExcelJS.Cell | undefined;
  ws!.eachRow((row) => row.eachCell((cell) => {
    if (!found && cell.value === header) found = cell;
  }));
  expect(found, `a "${header}" heading`).toBeDefined();
  expect(found!.font?.bold).toBe(true);
  expect(found!.border?.bottom?.style).toBeTruthy();
}
