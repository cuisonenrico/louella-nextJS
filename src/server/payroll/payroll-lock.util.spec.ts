import { ConflictException } from '@nestjs/common';
import { assertCutoffOpen, day, employeeLockedThrough } from './payroll-lock.util';

function fakeTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    payrollRun: { findFirst: jest.fn().mockResolvedValue(null) },
    payslip: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

describe('payroll locks', () => {
  it('reads a @db.Date back as its calendar day', () => {
    expect(day(new Date('2026-09-15T00:00:00.000Z'))).toBe('2026-09-15');
  });

  it('takes the cutoff lock before looking for a run', async () => {
    const tx = fakeTx();
    await assertCutoffOpen(tx as never, '2026-09-01');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.payrollRun.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.payrollRun.findFirst).toHaveBeenCalledWith({
      where: { periodStart: new Date('2026-09-01T00:00:00.000Z'), status: { not: 'VOIDED' } },
      select: { id: true },
    });
  });

  it('refuses a finalized cutoff', async () => {
    const tx = fakeTx();
    tx.payrollRun.findFirst.mockResolvedValue({ id: 4 });
    await expect(assertCutoffOpen(tx as never, '2026-09-01')).rejects.toThrow(ConflictException);
  });

  it('reports the end of the latest run that paid the employee', async () => {
    const tx = fakeTx();
    expect(await employeeLockedThrough(tx as never, 7)).toBeNull();

    tx.payslip.findFirst.mockResolvedValue({ run: { periodEnd: new Date('2026-09-15T00:00:00.000Z') } });
    expect(await employeeLockedThrough(tx as never, 7)).toBe('2026-09-15');
    expect(tx.payslip.findFirst).toHaveBeenLastCalledWith({
      where: { employeeId: 7, run: { status: { not: 'VOIDED' } } },
      orderBy: { run: { periodEnd: 'desc' } },
      select: { run: { select: { periodEnd: true } } },
    });
  });
});
