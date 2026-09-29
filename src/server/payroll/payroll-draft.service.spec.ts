import { PayrollDraftService } from './payroll-draft.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    firstName: 'Ana',
    lastName: 'Cruz',
    restDays: [0],
    hiredOn: at('2026-01-05'),
    separatedOn: null,
    jobRole: { name: 'Baker' },
    branch: { name: 'Main' },
    rates: [{ id: 10, dailyRate: 600, effectiveOn: at('2026-01-05') }],
    absences: [{ date: at('2026-09-02') }],
    adjustments: [{ id: 5, kind: 'ADDITION', category: 'BONUS', description: 'Bonus', amount: 1000 }],
    vale: [],
    recurringDeductions: [
      { id: 31, name: 'SSS', employeeShare: 450, employerShare: 950 },
      { id: 32, name: 'PhilHealth', employeeShare: 250, employerShare: 250 },
    ],
    skips: [{ id: 77, recurringDeductionId: 32 }],
    ...overrides,
  };
}

describe('PayrollDraftService', () => {
  let prisma: Record<string, any>;
  let service: PayrollDraftService;

  beforeEach(() => {
    prisma = {
      employee: { findMany: jest.fn().mockResolvedValue([employee()]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      payrollSettings: { findUnique: jest.fn().mockResolvedValue({ id: 1, regularHolidayMultiplier: 2, specialHolidayMultiplier: 1.3 }) },
    };
    service = new PayrollDraftService(prisma as never);
  });

  it('loads everyone employed during the cutoff with that cutoff’s inputs', async () => {
    await service.build('2026-09-01');
    const { where, include } = prisma.employee.findMany.mock.calls[0][0];
    expect(where).toEqual({
      deletedAt: null,
      hiredOn: { lte: at('2026-09-15') },
      OR: [{ separatedOn: null }, { separatedOn: { gte: at('2026-09-01') } }],
    });
    expect(include.absences.where).toEqual({ deletedAt: null, date: { gte: at('2026-09-01'), lte: at('2026-09-15') } });
    expect(include.adjustments.where).toEqual({ deletedAt: null, periodStart: at('2026-09-01') });
    expect(include.skips.where).toEqual({ deletedAt: null, periodStart: at('2026-09-01') });
    expect(include.rates.where).toEqual({ deletedAt: null, effectiveOn: { lte: at('2026-09-15') } });
    expect(include.vale).toEqual({
      where: { deletedAt: null, date: { gte: at('2026-09-01'), lte: at('2026-09-15') } },
      include: { branch: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  });

  it('computes each payslip and the cutoff totals', async () => {
    const draft = await service.build('2026-09-01');
    const [slip] = draft.payslips;
    // 12 days × 600 + 1000 bonus − 450 SSS (PhilHealth skipped)
    expect(slip).toMatchObject({
      employeeName: 'Ana Cruz',
      jobRoleName: 'Baker',
      branchName: 'Main',
      daysWorked: 12,
      netPay: 7750,
      totalEmployerShare: 950,
    });
    expect(slip.recurring).toEqual([
      { id: 31, name: 'SSS', employeeShare: 450, skipId: null },
      { id: 32, name: 'PhilHealth', employeeShare: 250, skipId: 77 },
    ]);
    expect(draft.totals).toEqual({ employeeCount: 1, netPay: 7750, employerShare: 950 });
    expect(draft.hasBlocking).toBe(false);
  });

  it('offers no recurring toggles on the second cutoff', async () => {
    const draft = await service.build('2026-09-16');
    expect(draft.payslips[0].recurring).toEqual([]);
    expect(draft.periodEnd).toBe('2026-09-30');
  });

  it('flags the cutoff as blocked when any payslip is', async () => {
    prisma.employee.findMany.mockResolvedValue([employee({ rates: [] })]);
    const draft = await service.build('2026-09-01');
    expect(draft.hasBlocking).toBe(true);
  });

  it('deducts the employee’s vale for the cutoff', async () => {
    prisma.employee.findMany.mockResolvedValue([
      employee({ vale: [{ id: 21, date: at('2026-09-03'), amount: 500, branch: { name: 'Main' } }] }),
    ]);
    const draft = await service.build('2026-09-01');
    expect(draft.payslips[0].lines).toContainEqual(
      expect.objectContaining({ label: 'Vale — Main, Sep 3', amount: 500, sourceType: 'BranchVale', sourceId: 21 }),
    );
  });

  it('loads the cutoff’s live holidays with their live rest-day marks', async () => {
    await service.build('2026-09-01');
    expect(prisma.holiday.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, date: { gte: at('2026-09-01'), lte: at('2026-09-15') } },
      include: { restDayWork: { where: { deletedAt: null }, select: { id: true, employeeId: true } } },
      orderBy: { date: 'asc' },
    });
  });

  it('pays holidays with the stored multipliers and this employee’s marks only', async () => {
    prisma.holiday.findMany.mockResolvedValue([
      { id: 90, date: at('2026-09-08'), name: 'A', type: 'REGULAR', isClosed: false, restDayWork: [] },
      { id: 91, date: at('2026-09-13'), name: 'B', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 5, employeeId: 1 }] },
      { id: 92, date: at('2026-09-06'), name: 'C', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 6, employeeId: 2 }] },
    ]);
    prisma.payrollSettings.findUnique.mockResolvedValue({ id: 1, regularHolidayMultiplier: 2.5, specialHolidayMultiplier: 1.5 });
    const draft = await service.build('2026-09-01');
    const holiday = draft.payslips[0].lines.filter((l) => l.type === 'HOLIDAY').map((l) => [l.sourceId, l.quantity]);
    // Sep 8 worked at 2.5; Sep 13 rest day marked → 1.5; Sep 6 rest day, marked for someone else → 1.00
    expect(holiday).toEqual([[92, 1], [90, 2.5], [91, 1.5]]);
  });

  it('falls back to the default multipliers when the settings row is missing', async () => {
    prisma.payrollSettings.findUnique.mockResolvedValue(null);
    prisma.holiday.findMany.mockResolvedValue([
      { id: 90, date: at('2026-09-08'), name: 'A', type: 'REGULAR', isClosed: false, restDayWork: [] },
    ]);
    const draft = await service.build('2026-09-01');
    expect(draft.payslips[0].lines.find((l) => l.type === 'HOLIDAY')?.quantity).toBe(2);
  });

  it('lists each holiday with the employees on rest day that date', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 1, firstName: 'Ana', lastName: 'Cruz', restDays: [0], hiredOn: at('2026-01-05'), separatedOn: null },
      { id: 2, firstName: 'Ben', lastName: 'Diaz', restDays: [2], hiredOn: at('2026-01-05'), separatedOn: null },
      { id: 3, firstName: 'Cy', lastName: 'Eco', restDays: [0], hiredOn: at('2026-09-10'), separatedOn: null },
    ]);
    prisma.holiday.findMany.mockResolvedValue([
      { id: 91, date: at('2026-09-06'), name: 'Sun holiday', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 5, employeeId: 1 }] },
    ]);
    const holidays = await service.holidays('2026-09-01');
    expect(holidays).toEqual([
      {
        id: 91,
        date: '2026-09-06',
        name: 'Sun holiday',
        type: 'SPECIAL',
        isClosed: false,
        // Ben rests on Tuesdays; Cy was hired after the holiday.
        restDayEmployees: [{ employeeId: 1, employeeName: 'Ana Cruz', markId: 5, stale: false }],
      },
    ]);
  });

  it('still lists a live mark whose employee is no longer eligible, flagged stale', async () => {
    // Employee 9's rest days changed (now Tuesday, not Sunday) since the mark was made.
    prisma.employee.findMany.mockImplementation(({ where }: any) => {
      if (where?.id?.in) {
        return Promise.resolve([
          { id: 9, firstName: 'Xen', lastName: 'Yu', restDays: [2], hiredOn: at('2026-01-05'), separatedOn: null, deletedAt: null },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.holiday.findMany.mockResolvedValue([
      { id: 91, date: at('2026-09-06'), name: 'Sun holiday', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 5, employeeId: 9 }] },
    ]);
    const holidays = await service.holidays('2026-09-01');
    expect(holidays).toEqual([
      {
        id: 91,
        date: '2026-09-06',
        name: 'Sun holiday',
        type: 'SPECIAL',
        isClosed: false,
        restDayEmployees: [{ employeeId: 9, employeeName: 'Xen Yu', markId: 5, stale: true }],
      },
    ]);
  });

  it('flags stale a live mark whose employee was soft-deleted, loading it without a deletedAt filter', async () => {
    prisma.employee.findMany.mockImplementation(({ where }: any) => {
      if (where?.id?.in) {
        expect(where).toEqual({ id: { in: [9] } });
        return Promise.resolve([
          { id: 9, firstName: 'Xen', lastName: 'Yu', restDays: [0], hiredOn: at('2026-01-05'), separatedOn: null, deletedAt: at('2026-09-10') },
        ]);
      }
      return Promise.resolve([]);
    });
    prisma.holiday.findMany.mockResolvedValue([
      { id: 91, date: at('2026-09-06'), name: 'Sun holiday', type: 'SPECIAL', isClosed: false, restDayWork: [{ id: 5, employeeId: 9 }] },
    ]);
    const holidays = await service.holidays('2026-09-01');
    expect(holidays[0].restDayEmployees).toEqual([{ employeeId: 9, employeeName: 'Xen Yu', markId: 5, stale: true }]);
  });
});
