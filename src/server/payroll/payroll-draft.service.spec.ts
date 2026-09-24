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
    prisma = { employee: { findMany: jest.fn().mockResolvedValue([employee()]) } };
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
});
