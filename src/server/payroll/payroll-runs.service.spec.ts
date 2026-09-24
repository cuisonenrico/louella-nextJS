import { BadRequestException, ConflictException } from '@nestjs/common';
import { PayrollRunsService } from './payroll-runs.service';
import type { CutoffDraft } from './payroll-draft.service';

const at = (d: string) => new Date(`${d}T00:00:00.000Z`);

function draft(overrides: Partial<CutoffDraft> = {}): CutoffDraft {
  return {
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    payslips: [
      {
        employeeId: 1,
        employeeName: 'Ana Cruz',
        jobRoleName: 'Baker',
        branchName: 'Main',
        workingDays: 13,
        absenceDays: 1,
        daysWorked: 12,
        basicPay: 7200,
        totalAdditions: 1000,
        totalDeductions: 450,
        netPay: 7750,
        totalEmployerShare: 950,
        lines: [
          { type: 'BASIC', label: 'Basic pay', quantity: 12, rate: 600, amount: 7200, sourceType: 'EmployeeRate', sourceId: 10 },
          { type: 'ADDITION', label: 'Bonus', quantity: null, rate: null, amount: 1000, sourceType: 'PayrollAdjustment', sourceId: 5 },
        ],
        warnings: [],
        recurring: [],
      },
    ],
    totals: { employeeCount: 1, netPay: 7750, employerShare: 950 },
    hasBlocking: false,
    ...overrides,
  };
}

const runRow = (overrides: Record<string, unknown> = {}) => ({
  id: 3,
  periodStart: at('2026-09-01'),
  periodEnd: at('2026-09-15'),
  status: 'FINALIZED',
  employeeCount: 1,
  totalNetPay: 7750,
  totalEmployerShare: 950,
  voidReason: null,
  payslips: [],
  ...overrides,
});

describe('PayrollRunsService', () => {
  let prisma: Record<string, any>;
  let drafts: { build: jest.Mock };
  let service: PayrollRunsService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      payrollRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(runRow()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(runRow()),
        create: jest.fn().mockResolvedValue(runRow()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(runRow(data))),
      },
      payslip: { create: jest.fn().mockResolvedValue({ id: 20 }), findUnique: jest.fn() },
      auditEvent: { createMany: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    drafts = { build: jest.fn().mockResolvedValue(draft()) };
    service = new PayrollRunsService(prisma as never, drafts as never);
  });

  describe('finalize', () => {
    it('locks the cutoff before checking for an existing run', async () => {
      await service.finalize('2026-09-01', 7);
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.payrollRun.findFirst.mock.invocationCallOrder[0],
      );
    });

    it('refuses a cutoff whose last day has not come yet (Manila)', async () => {
      // 2026-09-29 16:30 UTC is already Sep 30 in Manila — the cutoff's last day.
      await expect(service.finalize('2026-09-16', 7, new Date('2026-09-20T02:00:00Z'))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.payrollRun.create).not.toHaveBeenCalled();
      await expect(service.finalize('2026-09-16', 7, new Date('2026-09-29T16:30:00Z'))).resolves.toBeDefined();
    });

    it('refuses a cutoff that already has a run', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue({ id: 2 });
      await expect(service.finalize('2026-09-01', 7)).rejects.toThrow(ConflictException);
      expect(prisma.payrollRun.create).not.toHaveBeenCalled();
    });

    it('recomputes inside the transaction and refuses blocking warnings', async () => {
      drafts.build.mockResolvedValue(draft({ hasBlocking: true }));
      await expect(service.finalize('2026-09-01', 7)).rejects.toThrow(BadRequestException);
      expect(drafts.build).toHaveBeenCalledWith('2026-09-01', prisma);
    });

    it('refuses a cutoff with nobody to pay', async () => {
      drafts.build.mockResolvedValue(draft({ payslips: [], totals: { employeeCount: 0, netPay: 0, employerShare: 0 } }));
      await expect(service.finalize('2026-09-01', 7)).rejects.toThrow(BadRequestException);
    });

    it('freezes the draft into a run, payslips and ordered lines', async () => {
      await service.finalize('2026-09-01', 7);
      expect(prisma.payrollRun.create).toHaveBeenCalledWith({
        data: {
          periodStart: at('2026-09-01'),
          periodEnd: at('2026-09-15'),
          status: 'FINALIZED',
          employeeCount: 1,
          totalNetPay: 7750,
          totalEmployerShare: 950,
          finalizedById: 7,
        },
      });
      const payslip = prisma.payslip.create.mock.calls[0][0].data;
      expect(payslip).toMatchObject({ runId: 3, employeeId: 1, employeeName: 'Ana Cruz', netPay: 7750, daysWorked: 12 });
      expect(payslip.lines.create.map((l: { sortOrder: number; type: string }) => [l.sortOrder, l.type])).toEqual([
        [0, 'BASIC'],
        [1, 'ADDITION'],
      ]);
      expect(prisma.auditEvent.createMany).toHaveBeenCalled();
    });
  });

  describe('status changes', () => {
    it('marks a finalized run paid', async () => {
      await service.markPaid(3, 7);
      expect(prisma.payrollRun.update.mock.calls[0][0].data).toMatchObject({ status: 'PAID', paidById: 7 });
    });

    it('does not mark a paid or voided run paid again', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(runRow({ status: 'PAID' }));
      await expect(service.markPaid(3, 7)).rejects.toThrow(ConflictException);
    });

    it('voids with a reason and keeps the run', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(runRow({ status: 'PAID' }));
      await service.voidRun(3, ' Wrong absences ', 7);
      expect(prisma.payrollRun.update.mock.calls[0][0].data).toMatchObject({
        status: 'VOIDED',
        voidReason: 'Wrong absences',
        voidedById: 7,
      });
    });

    it('marks paid under the cutoff lock, reading the run inside the transaction', async () => {
      await service.markPaid(3, 7);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.payrollRun.update.mock.invocationCallOrder[0],
      );
      expect(prisma.payrollRun.findUnique.mock.invocationCallOrder[1]).toBeGreaterThan(
        prisma.$executeRaw.mock.invocationCallOrder[0],
      );
    });

    it('voids under the cutoff lock, re-reading the status after it', async () => {
      prisma.payrollRun.findUnique
        .mockResolvedValueOnce(runRow())
        .mockResolvedValueOnce(runRow({ status: 'VOIDED' }));
      await expect(service.voidRun(3, 'race', 7)).rejects.toThrow(ConflictException);
      expect(prisma.payrollRun.update).not.toHaveBeenCalled();
    });

    it('does not void twice', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(runRow({ status: 'VOIDED' }));
      await expect(service.voidRun(3, 'again', 7)).rejects.toThrow(ConflictException);
    });
  });

  describe('reading cutoffs', () => {
    it('returns the active run when the cutoff is finalized', async () => {
      prisma.payrollRun.findFirst.mockResolvedValue(runRow());
      const view = await service.getCutoff('2026-09-01');
      expect(view).toMatchObject({ status: 'FINALIZED', draft: null, run: { periodStart: '2026-09-01' } });
      expect(drafts.build).not.toHaveBeenCalled();
    });

    it('returns a live draft when the cutoff is open', async () => {
      const view = await service.getCutoff('2026-09-16');
      expect(view).toMatchObject({ status: 'OPEN', run: null, periodEnd: '2026-09-30' });
      expect(drafts.build).toHaveBeenCalledWith('2026-09-16');
    });

    it('lists all 24 cutoffs of a year with run status and voided count', async () => {
      prisma.payrollRun.findMany.mockResolvedValue([
        runRow({ id: 1, status: 'VOIDED' }),
        runRow({ id: 2, status: 'PAID' }),
      ]);
      const list = await service.listCutoffs(2026);
      expect(list).toHaveLength(24);
      const sep1 = list.find((c) => c.periodStart === '2026-09-01');
      expect(sep1).toEqual({
        periodStart: '2026-09-01',
        periodEnd: '2026-09-15',
        status: 'PAID',
        runId: 2,
        employeeCount: 1,
        totalNetPay: 7750,
        totalEmployerShare: 950,
        voidedRuns: 1,
      });
      expect(list.find((c) => c.periodStart === '2026-09-16')).toMatchObject({ status: 'OPEN', runId: null, totalNetPay: null });
    });

    it('rejects an absurd year', async () => {
      await expect(service.listCutoffs(1999)).rejects.toThrow(BadRequestException);
    });
  });
});
