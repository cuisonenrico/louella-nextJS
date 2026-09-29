import { Prisma } from '@prisma/client';
import { num } from '../common/utils/decimal.util';
import type { HolidayMultipliers } from './compute-payslip';

/** The DOLE defaults, also seeded into the PayrollSettings row by the migration. */
export const DEFAULT_MULTIPLIERS: HolidayMultipliers = { regular: 2, special: 1.3 };

/** The live multipliers; the defaults if the singleton row is missing. */
export async function readMultipliers(db: Prisma.TransactionClient): Promise<HolidayMultipliers> {
  const row = await db.payrollSettings.findUnique({ where: { id: 1 } });
  if (!row) return DEFAULT_MULTIPLIERS;
  return { regular: num(row.regularHolidayMultiplier), special: num(row.specialHolidayMultiplier) };
}
