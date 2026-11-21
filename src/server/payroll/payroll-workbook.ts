/**
 * A finalized payroll run as the client's paper payroll sheet
 * (`Documents/PAYROLL/Payroll-<company>-Nov15-2026.pdf`), one sheet per company.
 *
 * Each branch trades under its own business name, so each company's payroll
 * is its own sheet (or its own file, when one company is asked for). Built
 * only from the run's frozen payslips and their lines: the company is the
 * name snapshotted at finalize, so moving an employee later never moves an
 * old payslip to another business.
 *
 * Columns follow the paper sheet. Each payslip line lands in one column:
 * - BASIC lines → BASIC RATE (DAILY RATE is the latest rate in the cutoff)
 * - HOLIDAY lines → HOLIDAY PAY (regular), SPEC'L DAY PAY (special) or
 *   REST DAY PAY (a holiday on the employee's rest day)
 * - additions by category: OVERTIME → OVERTIME AMT, NIGHT_DIFF → NSD PAY,
 *   HOLIDAY → HOLIDAY PAY, anything else → OTHER PAY
 * - recurring deductions by name: SSS, PhilHealth, Pag-IBIG, SSS loan;
 *   vale → C.A.; anything else → OTHER DED.
 * OTHER PAY and OTHER DED. are not on the paper sheet; without them gross and
 * net would not add up whenever a payslip carries a bonus or a penalty.
 * Overtime hours are not recorded in the app, so that column is left blank
 * for hand entry, as is the signature column.
 *
 * Pure: plain figures in, a SheetJS workbook out. Gross, net and the total are
 * Excel formulas carrying the value computed here (in centavos), so an edited
 * cell recalculates and previews that never recalculate still show them.
 */
import * as XLSX from 'xlsx';
import { centavos, pesos } from '../common/utils/decimal.util';
import { setLayout, type SheetLayout } from '../common/utils/printable-workbook';

export const NO_COMPANY = 'No company';

export interface WorkbookRun {
  id: number;
  periodStart: string;
  periodEnd: string;
}

export interface WorkbookLine {
  type: 'BASIC' | 'HOLIDAY' | 'ADDITION' | 'DEDUCTION' | 'EMPLOYER_SHARE';
  label: string;
  rate: number | null;
  amount: number;
  sourceType: string | null;
  /** The adjustment's category, for lines that come from a PayrollAdjustment. */
  category?: string | null;
}

export interface WorkbookSlip {
  /** As printed: "Last, First". */
  employeeName: string;
  companyName: string | null;
  daysWorked: number;
  netPay: number;
  lines: WorkbookLine[];
}

export interface CompanyDetails {
  address: string | null;
  paymasterName: string | null;
  approverName: string | null;
}

export interface CompanyGroup {
  /** Null for payslips with no company. */
  company: string | null;
  slips: WorkbookSlip[];
}

/** Payslips grouped by company, companies by name, "No company" last; employees by name. */
export function groupByCompany(slips: WorkbookSlip[]): CompanyGroup[] {
  const byCompany = new Map<string | null, WorkbookSlip[]>();
  for (const s of slips) {
    const list = byCompany.get(s.companyName) ?? [];
    list.push(s);
    byCompany.set(s.companyName, list);
  }
  return [...byCompany.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([company, list]) => ({
      company,
      slips: [...list].sort((x, y) => x.employeeName.localeCompare(y.employeeName)),
    }));
}

const MAX_SHEET_NAME = 31;

/**
 * A sheet name Excel accepts: no `\ / ? * [ ] :`, at most 31 characters, and
 * unique in the workbook (case-insensitively), suffixed " (2)" etc. if taken.
 */
export function sheetNameFor(name: string, used: Set<string>): string {
  const clean = name.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Sheet';
  let candidate = clean.slice(0, MAX_SHEET_NAME).trim();
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = clean.slice(0, MAX_SHEET_NAME - suffix.length).trim() + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** One employee's row of the paper sheet, in pesos. */
export interface RegisterRow {
  dailyRate: number | null;
  basic: number;
  overtime: number;
  holiday: number;
  special: number;
  restDay: number;
  nsd: number;
  otherPay: number;
  gross: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  sssLoan: number;
  cashAdvance: number;
  otherDeductions: number;
  net: number;
}

type DeductionColumn = 'sss' | 'philhealth' | 'pagibig' | 'sssLoan' | 'otherDeductions';

/** Which column a recurring deduction belongs in, by its name. */
export function deductionColumn(name: string): DeductionColumn {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (n.includes('loan')) return n.includes('sss') ? 'sssLoan' : 'otherDeductions';
  if (n.includes('sss')) return 'sss';
  if (n.includes('philhealth') || n.includes('phic')) return 'philhealth';
  if (n.includes('pagibig') || n.includes('hdmf')) return 'pagibig';
  return 'otherDeductions';
}

/** Sorts a payslip's lines into the paper sheet's columns. */
export function registerRow(slip: WorkbookSlip): RegisterRow {
  const c = {
    basic: 0, overtime: 0, holiday: 0, special: 0, restDay: 0, nsd: 0, otherPay: 0,
    sss: 0, philhealth: 0, pagibig: 0, sssLoan: 0, cashAdvance: 0, otherDeductions: 0,
  };
  let dailyRate: number | null = null;
  for (const line of slip.lines) {
    const cents = centavos(line.amount);
    switch (line.type) {
      case 'BASIC':
        c.basic += cents;
        if (line.rate !== null) dailyRate = line.rate;
        break;
      case 'HOLIDAY':
        if (line.label.includes('(rest day')) c.restDay += cents;
        else if (line.label.startsWith('Regular')) c.holiday += cents;
        else c.special += cents;
        break;
      case 'ADDITION':
        if (line.category === 'OVERTIME') c.overtime += cents;
        else if (line.category === 'NIGHT_DIFF') c.nsd += cents;
        else if (line.category === 'HOLIDAY') c.holiday += cents;
        else c.otherPay += cents;
        break;
      case 'DEDUCTION':
        if (line.sourceType === 'BranchVale') c.cashAdvance += cents;
        else if (line.sourceType === 'RecurringDeduction') c[deductionColumn(line.label)] += cents;
        else c.otherDeductions += cents;
        break;
      default:
        break; // employer shares are recorded, never paid or deducted
    }
  }
  const gross = c.basic + c.overtime + c.holiday + c.special + c.restDay + c.nsd + c.otherPay;
  const deductions = c.sss + c.philhealth + c.pagibig + c.sssLoan + c.cashAdvance + c.otherDeductions;
  const out = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, pesos(v)])) as Omit<RegisterRow, 'dailyRate' | 'gross' | 'net'>;
  return { ...out, dailyRate, gross: pesos(gross), net: pesos(gross - deductions) };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "November 1-15, 2026", as on the paper sheet. */
export function periodLabel(periodStart: string, periodEnd: string): string {
  const [y, m, d1] = periodStart.split('-').map(Number);
  const d2 = Number(periodEnd.slice(8, 10));
  return `${MONTHS[m - 1]} ${d1}-${d2}, ${y}`;
}

/** Column letters of the sheet, left to right. */
const COL = {
  no: 0, name: 1, days: 2, rate: 3, basic: 4, otHours: 5, overtime: 6, holiday: 7, special: 8,
  restDay: 9, nsd: 10, otherPay: 11, gross: 12, sss: 13, philhealth: 14, pagibig: 15, sssLoan: 16,
  cashAdvance: 17, otherDeductions: 18, net: 19, signature: 20,
} as const;
const LAST_COL = COL.signature;

const HEADER_TOP: [number, string][] = [
  [COL.name, 'NAME OF'], [COL.days, 'DAYS'], [COL.rate, 'DAILY'], [COL.basic, 'BASIC'],
  [COL.otHours, 'OVERTIME'], [COL.holiday, 'HOLIDAY'], [COL.special, "SPEC'L"], [COL.restDay, 'REST'],
  [COL.nsd, 'NSD'], [COL.otherPay, 'OTHER'], [COL.gross, 'GROSS'], [COL.sss, 'DEDUCTIONS'],
  [COL.net, 'NET'], [COL.signature, 'SIGNATURE'],
];
const HEADER_BOTTOM: [number, string][] = [
  [COL.name, 'EMPLOYEE'], [COL.days, 'WORKED'], [COL.rate, 'RATE'], [COL.basic, 'RATE'],
  [COL.otHours, 'HRS.'], [COL.overtime, 'AMT.'], [COL.holiday, 'PAY'], [COL.special, 'DAY PAY'],
  [COL.restDay, 'DAY PAY'], [COL.nsd, 'PAY'], [COL.otherPay, 'PAY'], [COL.gross, 'PAY'],
  [COL.sss, 'SSS'], [COL.philhealth, 'Philhealth'], [COL.pagibig, 'Pag-ibig'], [COL.sssLoan, 'SSS Loan'],
  [COL.cashAdvance, 'C.A.'], [COL.otherDeductions, 'OTHER DED.'], [COL.net, 'SALARY'],
];

const MONEY = '#,##0.00;-#,##0.00;"-"';
/** The paper sheet always has this many numbered lines, blank ones left for hand entry. */
export const MIN_ROWS = 24;
// The signature column is wide enough to sign in, and to hold the period line above it.
const WIDTHS = [4, 26, 8, 9, 11, 7, 10, 10, 10, 10, 10, 10, 12, 9, 10, 9, 9, 10, 10, 12, 28];

const letter = (c: number) => XLSX.utils.encode_col(c);

function buildSheet(run: WorkbookRun, group: CompanyGroup, details: CompanyDetails | undefined): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const put = (row: number, col: number, cell: XLSX.CellObject) => {
    ws[XLSX.utils.encode_cell({ r: row - 1, c: col })] = cell;
  };
  const text = (row: number, col: number, v: string) => put(row, col, { t: 's', v });
  const money = (row: number, col: number, v: number) => put(row, col, { t: 'n', v, z: MONEY });
  const merge = (row: number, c1: number, c2: number) => merges.push({ s: { r: row - 1, c: c1 }, e: { r: row - 1, c: c2 } });

  const company = group.company ?? NO_COMPANY;
  text(1, 0, 'P A Y R O L L');
  merge(1, 0, LAST_COL);
  text(2, COL.net, `For the period of ${periodLabel(run.periodStart, run.periodEnd)}`);
  merge(2, COL.net, LAST_COL);
  text(4, COL.name, `WE HEREBY ACKNOWLEDGE to have received from ${[company, details?.address].filter(Boolean).join(', ')}`);
  merge(4, COL.name, LAST_COL);
  text(5, COL.name, 'the sum specified opposite our respective names, as full compensation for services rendered.');
  merge(5, COL.name, LAST_COL);

  const top = 6;
  for (const [c, v] of HEADER_TOP) text(top, c, v);
  merge(top, COL.otHours, COL.overtime);
  merge(top, COL.sss, COL.otherDeductions);
  for (const [c, v] of HEADER_BOTTOM) text(top + 1, c, v);

  const first = top + 2;
  group.slips.forEach((slip, i) => {
    const row = first + i;
    const r = registerRow(slip);
    put(row, COL.no, { t: 'n', v: i + 1 });
    text(row, COL.name, slip.employeeName);
    put(row, COL.days, { t: 'n', v: slip.daysWorked, z: '0.00' });
    if (r.dailyRate !== null) money(row, COL.rate, r.dailyRate);
    money(row, COL.basic, r.basic);
    money(row, COL.overtime, r.overtime);
    money(row, COL.holiday, r.holiday);
    money(row, COL.special, r.special);
    money(row, COL.restDay, r.restDay);
    money(row, COL.nsd, r.nsd);
    money(row, COL.otherPay, r.otherPay);
    put(row, COL.gross, { t: 'n', f: `SUM(${letter(COL.basic)}${row}:${letter(COL.otherPay)}${row})`, v: r.gross, z: MONEY });
    money(row, COL.sss, r.sss);
    money(row, COL.philhealth, r.philhealth);
    money(row, COL.pagibig, r.pagibig);
    money(row, COL.sssLoan, r.sssLoan);
    money(row, COL.cashAdvance, r.cashAdvance);
    money(row, COL.otherDeductions, r.otherDeductions);
    put(row, COL.net, {
      t: 'n',
      f: `${letter(COL.gross)}${row}-SUM(${letter(COL.sss)}${row}:${letter(COL.otherDeductions)}${row})`,
      v: r.net,
      z: MONEY,
    });
  });

  // Numbered blank lines up to the paper sheet's 24, as the client prints it.
  const lines = Math.max(group.slips.length, MIN_ROWS);
  for (let i = group.slips.length; i < lines; i++) put(first + i, COL.no, { t: 'n', v: i + 1 });
  const last = first + lines - 1;
  const totalRow = last + 1;
  text(totalRow, COL.name, 'TOTAL');
  const netTotal = pesos(group.slips.reduce((acc, s) => acc + centavos(registerRow(s).net), 0));
  put(totalRow, COL.net, { t: 'n', f: `SUM(${letter(COL.net)}${first}:${letter(COL.net)}${last})`, v: netTotal, z: MONEY });

  const foot = totalRow + 2;
  text(foot, COL.name, 'PAYMASTER:');
  text(foot, COL.holiday, 'I HEREBY CERTIFY that I have personally paid in cash to each employee whose');
  text(foot, COL.net, 'APPROVED FOR PAYMENT:');
  text(foot + 1, COL.holiday, 'name appears in the above payroll the amount set opposite his name.');
  text(foot + 2, COL.holiday, 'The amount paid in this payroll is P____________ including their overtime pay');
  text(foot + 3, COL.holiday, `__________________________, ${run.periodStart.slice(0, 4)}`);
  text(foot + 4, COL.name, details?.paymasterName ?? '');
  text(foot + 4, COL.holiday, '(Date of payment)');
  text(foot + 4, COL.net, details?.approverName ?? '');
  text(foot + 5, COL.name, 'In-charge');
  text(foot + 5, COL.net, 'Manager');

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: foot + 4, c: LAST_COL } });
  ws['!cols'] = WIDTHS.map((wch) => ({ wch }));
  ws['!merges'] = merges;

  const all = (r1: number, r2: number, look: SheetLayout['looks'][number]['look']) => ({ r1, r2, c1: 0, c2: LAST_COL, look });
  const cols = (r1: number, r2: number, c1: number, c2: number, look: SheetLayout['looks'][number]['look']) => ({ r1, r2, c1, c2, look });
  setLayout(ws, {
    looks: [
      all(1, 1, 'title'),
      cols(2, 2, COL.net, LAST_COL, 'headingRight'),
      cols(4, 5, COL.name, LAST_COL, 'emphasis'),
      all(top, top + 1, 'header'),
      // The cells the paper sheet fills in blue.
      ...[COL.name, COL.days].map((c) => cols(top, top + 1, c, c, 'headerAccent')),
      cols(top, top + 1, COL.otHours, COL.overtime, 'headerAccent'),
      cols(top, top + 1, COL.sss, COL.otherDeductions, 'headerAccent'),
      all(first, last, 'body'),
      // Bold on paper: who, basic, gross and what they take home.
      ...[COL.name, COL.basic, COL.gross, COL.net].map((c) => cols(first, last, c, c, 'bodyStrong')),
      all(totalRow, totalRow, 'grandTotal'),
      cols(foot, foot + 2, 0, LAST_COL, 'emphasis'),
      cols(foot + 4, foot + 4, COL.name, COL.name, 'signName'),
      cols(foot + 4, foot + 4, COL.net, COL.net, 'signName'),
      cols(foot + 5, foot + 5, COL.name, COL.name, 'signNote'),
      cols(foot + 5, foot + 5, COL.net, COL.net, 'signNote'),
      cols(foot + 4, foot + 4, COL.holiday, COL.holiday, 'signNote'),
    ],
    frames: [
      { r1: top, r2: top + 1, c1: 0, c2: LAST_COL },
      { r1: top, r2: totalRow, c1: 0, c2: LAST_COL },
    ],
    rowHeights: { 1: 30, [top]: 16, [top + 1]: 16 },
    page: {
      orientation: 'landscape',
      // Long paper, as the client prints the payroll.
      paper: 'legal',
      // No repeated header rows: the 24-line sheet fits one long page, and the
      // company name (often with an apostrophe) would break the print-titles name.
      footer: [company, periodLabel(run.periodStart, run.periodEnd), 'Page &P of &N'],
      freeze: { rows: top + 1, cols: COL.name + 1 },
    },
  });
  return ws;
}

/**
 * The run's payroll sheets. `only` limits it to one company (`null` = the
 * payslips with no company); omitted, every company gets a sheet.
 * `companies` gives each company's address and signatories, by name.
 */
export function buildPayrollWorkbook(
  run: WorkbookRun,
  slips: WorkbookSlip[],
  companies: Map<string, CompanyDetails>,
  only?: { company: string | null },
): XLSX.WorkBook {
  const groups = groupByCompany(slips).filter((g) => only === undefined || g.company === only.company);
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const g of groups) {
    const details = g.company === null ? undefined : companies.get(g.company);
    XLSX.utils.book_append_sheet(wb, buildSheet(run, g, details), sheetNameFor(g.company ?? NO_COMPANY, used));
  }
  return wb;
}

/** A filename-safe slug: `Louella Bakeshop, Inc.` → `louella-bakeshop-inc`. */
export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'company';
}
