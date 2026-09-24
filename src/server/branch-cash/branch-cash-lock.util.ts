import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { manilaToday } from '@/lib/manilaDate';
import { toUtcDay } from '../common/utils/date-range.util';

type Tx = Prisma.TransactionClient;

/**
 * A verified branch-day is signed off: its expenses, vale and counted cash
 * cannot change until an admin reopens it.
 *
 * Every writer, and verify/reopen, takes a transaction-scoped advisory lock on
 * the branch-day first — so a write cannot slip in between verify's snapshot and
 * its status change, even before a BranchCashDay row exists (a row lock could
 * not cover that). Namespace 5: stock-chain.ts uses 1–3, payroll 4.
 */
const BRANCH_CASH_LOCK_NS = 5;

export async function lockCashDay(tx: Tx, branchId: number, date: string): Promise<void> {
  const key = `${branchId}|${date}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BRANCH_CASH_LOCK_NS}::int, hashtext(${key}))`;
}

/** Locks the branch-day and throws if it is verified. */
export async function assertDayOpen(tx: Tx, branchId: number, date: string): Promise<void> {
  await lockCashDay(tx, branchId, date);
  const day = await tx.branchCashDay.findUnique({
    where: { branchId_date: { branchId, date: toUtcDay(date) } },
    select: { status: true },
  });
  if (day?.status === 'VERIFIED') {
    throw new ConflictException('This day is verified. Ask an admin to reopen it.');
  }
}

/** Past days are fine — managers often catch up the next morning. */
export function assertNotFuture(date: string, now: Date = new Date()): void {
  if (date > manilaToday(now)) {
    throw new BadRequestException('The date cannot be in the future.');
  }
}
