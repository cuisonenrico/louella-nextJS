import * as XLSX from 'xlsx';
import { buildInventoryWorkbook, sheetNameFor, writeInventoryWorkbook, type WorkbookInput } from './inventory-workbook';

const input: WorkbookInput = {
  branchName: 'C2',
  from: '2026-10-30',
  to: '2026-10-31',
  pricedOn: '2026-11-15',
  products: [
    { id: 1, name: 'Pandesal', type: 'BREAD', price: 3 },
    { id: 2, name: 'Spanish Bread', type: 'BREAD', price: 5 },
    { id: 3, name: 'Brownies', type: 'CAKE', price: 28 },
  ],
  days: [
    {
      date: '2026-10-30',
      rows: [
        // opening 10 + delivery 100 + in 5 − out 2 − leftover 20 − reject 3 = 90 sold
        { productId: 1, opening: 10, delivery: 100, pullIn: 5, pullOut: 2, leftover: 20, reject: 3 },
        // not counted: sells nothing, leftover shown as the derived close (0 + 30 − 1 = 29)
        { productId: 2, opening: 0, delivery: 30, pullIn: 0, pullOut: 0, leftover: null, reject: 1 },
        { productId: 3, opening: 0, delivery: 10, pullIn: 0, pullOut: 0, leftover: 4, reject: 0 },
      ],
      cash: { expenses: 100.5, vale: 50, actualCash: 400, status: 'VERIFIED' },
    },
    { date: '2026-10-31', rows: [], cash: { expenses: 0, vale: 0, actualCash: null, status: 'OPEN' } },
  ],
};

/** The row whose column A reads `label` (1-based row number), on a sheet. */
function rowOf(ws: XLSX.WorkSheet, label: string): number {
  const range = XLSX.utils.decode_range(ws['!ref']!);
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v === label) return r + 1;
  }
  throw new Error(`no row "${label}"`);
}
const v = (ws: XLSX.WorkSheet, addr: string) => ws[addr]?.v;

describe('buildInventoryWorkbook', () => {
  const wb = buildInventoryWorkbook(input);
  const oct30 = wb.Sheets['Oct 30'];

  it('has one sheet per day, then Summary', () => {
    expect(wb.SheetNames).toEqual(['Oct 30', 'Oct 31', 'Summary']);
    expect(sheetNameFor('2026-01-05')).toBe('Jan 05');
  });

  it('writes the paper sheet columns with formulas and their values', () => {
    const r = rowOf(oct30, 'Pandesal');
    expect(v(oct30, `B${r}`)).toBe(3);
    expect(v(oct30, `C${r}`)).toBe(100);
    expect(oct30[`D${r}`]).toMatchObject({ f: `B${r}*C${r}`, v: 300 });
    expect(oct30[`I${r}`]).toMatchObject({ f: `J${r}+C${r}+K${r}-L${r}-E${r}-G${r}`, v: 90 });
    expect(oct30[`M${r}`]).toMatchObject({ f: `B${r}*I${r}`, v: 270 });
  });

  it('an uncounted leftover sells nothing and is marked', () => {
    const r = rowOf(oct30, 'Spanish Bread');
    expect(v(oct30, `E${r}`)).toBe(29);
    expect(v(oct30, `I${r}`)).toBe(0);
    expect(v(oct30, `N${r}`)).toBe('Not counted');
  });

  it('totals each category and works out the cash', () => {
    const totals = [...Array(200).keys()].map((i) => i + 1).filter((r) => v(oct30, `A${r}`) === 'TOTAL');
    // Bread TOTAL, Cake TOTAL, then the summary TOTAL
    expect(v(oct30, `M${totals[0]}`)).toBe(270);
    expect(v(oct30, `M${totals[1]}`)).toBe(6 * 28);
    const sales = 270 + 168;
    const r = rowOf(oct30, 'EXPECTED SALES (DAPAT BENTA)');
    expect(v(oct30, `B${r}`)).toBe(sales);
    expect(v(oct30, `B${rowOf(oct30, 'EXPECTED CASH')}`)).toBe(sales - 100.5 - 50);
    expect(v(oct30, `B${rowOf(oct30, 'SHORT / OVER')}`)).toBe(400 - (sales - 150.5));
    expect(v(oct30, `B${rowOf(oct30, 'CASH DAY')}`)).toBe('Verified');
  });

  it('a day without rows still gets its sheet, cash not counted', () => {
    const oct31 = wb.Sheets['Oct 31'];
    expect(v(oct31, `B${rowOf(oct31, 'EXPECTED SALES (DAPAT BENTA)')}`)).toBe(0);
    expect(v(oct31, `C${rowOf(oct31, 'ACTUAL CASH')}`)).toBe('Not counted');
  });

  it('summarises the range per product and per day', () => {
    const sum = wb.Sheets.Summary;
    const p = rowOf(sum, 'Pandesal');
    expect(v(sum, `G${p}`)).toBe(90);
    expect(v(sum, `H${p}`)).toBe(270);
    expect(v(sum, `H${rowOf(sum, 'GRAND TOTAL')}`)).toBe(438);
    const days = rowOf(sum, 'DATE');
    expect(sum[`B${days + 1}`]).toMatchObject({ f: expect.stringMatching(/^'Oct 30'!B\d+$/), v: 438 });
    expect(v(sum, `F${days + 2}`)).toBe('Not counted');
  });

  it('writes a readable xlsx', () => {
    const back = XLSX.read(writeInventoryWorkbook(input), { type: 'buffer' });
    expect(back.SheetNames).toEqual(['Oct 30', 'Oct 31', 'Summary']);
  });
});
