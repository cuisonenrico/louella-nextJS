import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toUtcDay } from '../common/utils/date-range.util';

type Tx = Prisma.TransactionClient;

/**
 * A finalized cutoff is a financial record: its absences, adjustments and
 * skips cannot change until the run is voided.
 *
 * Every writer of those inputs, and finalize itself, takes a transaction-scoped
 * advisory lock on the cutoff first, so an absence cannot slip in between
 * finalize's recompute and its insert. Namespace 4 — stock-chain.ts uses 1–3.
 */
const PAYROLL_LOCK_NS = 4;

/** A `@db.Date` column back to its `YYYY-MM-DD` day. */
export function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function lockCutoff(tx: Tx, periodStart: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PAYROLL_LOCK_NS}::int, hashtext(${periodStart}))`;
}

/** Locks the cutoff and throws if it already has a non-voided run. */
export async function assertCutoffOpen(tx: Tx, periodStart: string): Promise<void> {
  await lockCutoff(tx, periodStart);
  const run = await tx.payrollRun.findFirst({
    where: { periodStart: toUtcDay(periodStart), status: { not: 'VOIDED' } },
    select: { id: true },
  });
  if (run) {
    throw new ConflictException(
      `The cutoff starting ${periodStart} is finalized. Void its payroll run to change it.`,
    );
  }
}

/**
 * The last day covered by a non-voided run that paid this employee, or null.
 * Rates dated on or before it are fixed.
 */
export async function employeeLockedThrough(tx: Tx, employeeId: number): Promise<string | null> {
  const latest = await tx.payslip.findFirst({
    where: { employeeId, run: { status: { not: 'VOIDED' } } },
    orderBy: { run: { periodEnd: 'desc' } },
    select: { run: { select: { periodEnd: true } } },
  });
  return latest ? day(latest.run.periodEnd) : null;
}
