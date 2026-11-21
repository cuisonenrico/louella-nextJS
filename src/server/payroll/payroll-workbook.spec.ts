import * as XLSX from 'xlsx';
import {
  buildPayrollWorkbook,
  deductionColumn,
  groupByCompany,
  NO_COMPANY,
  periodLabel,
  registerRow,
  sheetNameFor,
  slug,
  type CompanyDetails,
  type WorkbookLine,
  type WorkbookSlip,
} from './payroll-workbook';

const run = { id: 12, periodStart: '2026-11-01', periodEnd: '2026-11-15' };

const basic = (amount: number, rate = 600): WorkbookLine => ({ type: 'BASIC', label: 'Basic pay', rate, amount, sourceType: 'EmployeeRate' });

function slip(o: Partial<WorkbookSlip> = {}): WorkbookSlip {
  return {
    employeeName: 'Cruz, Ana',
    companyName: "LOUELLA'S BAKESHOP (main)",
    daysWorked: 13,
    netPay: 7800,
    lines: [basic(7800)],
    ...o,
  };
}

const details = new Map<string, CompanyDetails>([
  ["LOUELLA'S BAKESHOP (main)", {
    address: '#29 Gov. Sison St., Lingayen, Pangasinan',
    paymasterName: 'MARILOU C. SISON',
    approverName: 'LESLEY MAULEON CUISON',
  }],
]);

const roundTrip = (wb: XLSX.WorkBook) => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
const rowsOf = (ws: XLSX.WorkSheet) => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: true, defval: null });

describe('registerRow', () => {
  it('sorts every line into the paper sheet columns, and gross − deductions = net', () => {
    const r = registerRow(slip({
      lines: [
        basic(3000, 600),
        basic(3250, 650), // mid-cutoff raise: the daily rate shown is the latest
        { type: 'HOLIDAY', label: 'Regular holiday — Nov 30 (worked)', rate: 650, amount: 1300, sourceType: 'Holiday' },
        { type: 'HOLIDAY', label: 'Special holiday — Nov 1 (worked)', rate: 600, amount: 180, sourceType: 'Holiday' },
        { type: 'HOLIDAY', label: 'Special holiday — Nov 2 (rest day)', rate: 600, amount: 600, sourceType: 'Holiday' },
        { type: 'ADDITION', label: 'OT', rate: null, amount: 400, sourceType: 'PayrollAdjustment', category: 'OVERTIME' },
        { type: 'ADDITION', label: 'Night', rate: null, amount: 130, sourceType: 'PayrollAdjustment', category: 'NIGHT_DIFF' },
        { type: 'ADDITION', label: 'Bonus', rate: null, amount: 500, sourceType: 'PayrollAdjustment', category: 'BONUS' },
        { type: 'DEDUCTION', label: 'SSS', rate: null, amount: 300, sourceType: 'RecurringDeduction' },
        { type: 'DEDUCTION', label: 'PhilHealth', rate: null, amount: 250, sourceType: 'RecurringDeduction' },
        { type: 'DEDUCTION', label: 'Pag-IBIG', rate: null, amount: 200, sourceType: 'RecurringDeduction' },
        { type: 'DEDUCTION', label: 'SSS Loan', rate: null, amount: 460, sourceType: 'RecurringDeduction' },
        { type: 'DEDUCTION', label: 'Vale — Main, Nov 3', rate: null, amount: 1000.5, sourceType: 'BranchVale' },
        { type: 'DEDUCTION', label: 'Broken tray', rate: null, amount: 50, sourceType: 'PayrollAdjustment', category: 'OFFENSE' },
        { type: 'EMPLOYER_SHARE', label: 'SSS (employer share)', rate: null, amount: 900, sourceType: 'RecurringDeduction' },
      ],
    }));
    expect(r).toEqual({
      dailyRate: 650,
      basic: 6250,
      overtime: 400,
      holiday: 1300,
      special: 180,
      restDay: 600,
      nsd: 130,
      otherPay: 500,
      gross: 9360,
      sss: 300,
      philhealth: 250,
      pagibig: 200,
      sssLoan: 460,
      cashAdvance: 1000.5,
      otherDeductions: 50,
      net: 7099.5,
    });
  });
});

describe('deductionColumn', () => {
  it.each([
    ['SSS', 'sss'],
    ['SSS Contribution', 'sss'],
    ['PhilHealth', 'philhealth'],
    ['Pag-IBIG', 'pagibig'],
    ['HDMF', 'pagibig'],
    ['SSS Loan', 'sssLoan'],
    ['Pag-IBIG Loan', 'otherDeductions'],
    ['Uniform', 'otherDeductions'],
  ])('%s → %s', (name, col) => expect(deductionColumn(name)).toBe(col));
});

describe('periodLabel', () => {
  it('reads like the paper sheet', () => {
    expect(periodLabel('2026-11-01', '2026-11-15')).toBe('November 1-15, 2026');
    expect(periodLabel('2026-02-16', '2026-02-28')).toBe('February 16-28, 2026');
  });
});

describe('groupByCompany', () => {
  it('sorts companies by name with "No company" last, and employees by name', () => {
    const groups = groupByCompany([
      slip({ companyName: null, employeeName: 'Zed' }),
      slip({ companyName: 'B Corp', employeeName: 'Yna' }),
      slip({ companyName: 'A Corp', employeeName: 'Xia' }),
      slip({ companyName: 'B Corp', employeeName: 'Ana' }),
    ]);
    expect(groups.map((g) => g.company)).toEqual(['A Corp', 'B Corp', null]);
    expect(groups[1].slips.map((s) => s.employeeName)).toEqual(['Ana', 'Yna']);
  });
});

describe('sheetNameFor', () => {
  it('replaces characters Excel forbids and truncates to 31', () => {
    const used = new Set<string>();
    expect(sheetNameFor('A/B: Bakery [Main]?', used)).toBe('A B Bakery Main');
    expect(sheetNameFor('Louella Bakeshop and Pastry Corporation of Manila', used).length).toBeLessThanOrEqual(31);
  });

  it('de-duplicates names that collide after cleaning, case-insensitively', () => {
    const used = new Set<string>();
    expect(sheetNameFor('A/B', used)).toBe('A B');
    expect(sheetNameFor('a:b', used)).toBe('a b (2)');
    const base = 'X'.repeat(40);
    sheetNameFor(base, used);
    const second = sheetNameFor(base, used);
    expect(second).toBe(`${'X'.repeat(27)} (2)`);
  });
});

describe('buildPayrollWorkbook', () => {
  const slips = [
    slip({ employeeName: 'Cruz, Ana', lines: [basic(7800.1)] }),
    slip({ employeeName: 'Diaz, Ben', daysWorked: 12.5, lines: [basic(6500.2, 520)] }),
    slip({ employeeName: 'Uy, Cara', companyName: 'MONRAY Bakery (CONTRACTUAL)', lines: [basic(5000)] }),
    slip({ employeeName: 'Go, Dan', companyName: null, lines: [basic(4000)] }),
  ];

  it('puts each company on its own sheet, "No company" last', () => {
    const wb = buildPayrollWorkbook(run, slips, details);
    expect(wb.SheetNames).toEqual(["LOUELLA'S BAKESHOP (main)", 'MONRAY Bakery (CONTRACTUAL)', NO_COMPANY]);
  });

  it('lays a sheet out like the paper payroll', () => {
    const ws = roundTrip(buildPayrollWorkbook(run, slips, details)).Sheets["LOUELLA'S BAKESHOP (main)"];
    const rows = rowsOf(ws);
    expect(rows[0][0]).toBe('P A Y R O L L');
    expect(rows[1][19]).toBe('For the period of November 1-15, 2026');
    expect(rows[3][1]).toBe("WE HEREBY ACKNOWLEDGE to have received from LOUELLA'S BAKESHOP (main), #29 Gov. Sison St., Lingayen, Pangasinan");
    expect(rows[6].slice(0, 5)).toEqual([null, 'EMPLOYEE', 'WORKED', 'RATE', 'RATE']);
    expect(rows[7].slice(0, 5)).toEqual([1, 'Cruz, Ana', 13, 600, 7800.1]);
    expect(rows[7][12]).toBe(7800.1); // gross
    expect(rows[7][19]).toBe(7800.1); // net
    expect(rows[8].slice(0, 4)).toEqual([2, 'Diaz, Ben', 12.5, 520]);
    expect(rows[9][1]).toBe('TOTAL');
    expect(rows[9][19]).toBe(14300.3);
    expect(ws['T10'].f).toBe('SUM(T8:T9)');
    expect(ws['M8'].f).toBe('SUM(E8:L8)');
    expect(ws['T8'].f).toBe('M8-SUM(N8:S8)');
    const flat = rows.flat();
    expect(flat).toContain('MARILOU C. SISON');
    expect(flat).toContain('LESLEY MAULEON CUISON');
    expect(flat).toContain('(Date of payment)');
  });

  it('prints just the company name when it has no address', () => {
    const rows = rowsOf(roundTrip(buildPayrollWorkbook(run, slips, details)).Sheets['MONRAY Bakery (CONTRACTUAL)']);
    expect(rows[3][1]).toBe('WE HEREBY ACKNOWLEDGE to have received from MONRAY Bakery (CONTRACTUAL)');
  });

  it('limits to one company when asked, including "No company"', () => {
    expect(buildPayrollWorkbook(run, slips, details, { company: 'MONRAY Bakery (CONTRACTUAL)' }).SheetNames)
      .toEqual(['MONRAY Bakery (CONTRACTUAL)']);
    expect(buildPayrollWorkbook(run, slips, details, { company: null }).SheetNames).toEqual([NO_COMPANY]);
  });

  it('puts a run finalized before companies existed on one "No company" sheet', () => {
    const wb = buildPayrollWorkbook(run, [slip({ companyName: null }), slip({ companyName: null, employeeName: 'B' })], details);
    expect(wb.SheetNames).toEqual([NO_COMPANY]);
  });
});

describe('slug', () => {
  it('makes a filename-safe name', () => {
    expect(slug("LOUELLA'S BAKESHOP (main)")).toBe('louella-s-bakeshop-main');
    expect(slug('***')).toBe('company');
  });
});
