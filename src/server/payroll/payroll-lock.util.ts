import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatCutoff } from '@/lib/payroll/cutoff';
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

/**
 * Employee records that feed every cutoff at once — rates, rest days, hire
 * and separation dates, recurring deductions — are not dated to one cutoff,
 * so the cutoff lock cannot guard them. Finalize takes this lock shared (so
 * finalizes never wait on each other) and their writers take it exclusive:
 * a rate saved while finalize reads the draft now waits for it, instead of
 * landing inside the period just frozen.
 */
export async function lockEmployeeInputs(tx: Tx, mode: 'shared' | 'exclusive'): Promise<void> {
  if (mode === 'shared') {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${PAYROLL_LOCK_NS}::int, hashtext('employee-inputs'))`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PAYROLL_LOCK_NS}::int, hashtext('employee-inputs'))`;
  }
}

/**
 * Throws if a finalized (non-voided) run covers any day from `from` to `to`
 * (open-ended when null). Used before a change that would alter pay on those
 * days — a hire or separation date moving across them.
 */
export async function assertNoFinalizedRunBetween(
  tx: Tx,
  from: string,
  to: string | null,
  what: string,
): Promise<void> {
  if (to !== null && to < from) return;
  const run = await tx.payrollRun.findFirst({
    where: {
      status: { not: 'VOIDED' },
      periodEnd: { gte: toUtcDay(from) },
      ...(to !== null ? { periodStart: { lte: toUtcDay(to) } } : {}),
    },
    orderBy: { periodStart: 'asc' },
    select: { periodStart: true, periodEnd: true },
  });
  if (run) {
    const cutoff = formatCutoff({ periodStart: day(run.periodStart), periodEnd: day(run.periodEnd) });
    throw new ConflictException(`${what} would change pay for ${cutoff}, which is finalized. Void that payroll run first.`);
  }
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
