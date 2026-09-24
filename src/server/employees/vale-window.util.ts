import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toUtcDay } from '../common/utils/date-range.util';
import { day } from '../payroll/payroll-lock.util';

/**
 * Payroll deducts a vale only while its date falls inside the employee's
 * employment. Moving hiredOn later or separatedOn earlier than a vale would
 * silently drop that vale from every payslip, so the change is refused.
 */
export async function assertValeWithinEmployment(
  tx: Prisma.TransactionClient,
  employeeId: number,
  hiredOn: string,
  separatedOn: string | null,
): Promise<void> {
  const outside: Prisma.BranchValeWhereInput[] = [{ date: { lt: toUtcDay(hiredOn) } }];
  if (separatedOn) outside.push({ date: { gt: toUtcDay(separatedOn) } });
  const stranded = await tx.branchVale.findFirst({
    where: { employeeId, deletedAt: null, OR: outside },
    select: { date: true },
    orderBy: { date: 'asc' },
  });
  if (stranded) {
    throw new ConflictException(
      `This employee has a vale dated ${day(stranded.date)}, outside the new employment dates. Void or reassign it first.`,
    );
  }
}
