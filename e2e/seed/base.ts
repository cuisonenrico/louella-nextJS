import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BCRYPT_COST_FACTOR } from '@/server/common/constants/security.constants';
import { ADMIN, KITCHEN_BRANCH_ID, MANAGER, VIEWER } from '../support/credentials';

/** Only what the API cannot create or every test needs. Everything else is per-test (fixtures/world.ts). */
export async function seedBase(prisma: PrismaClient): Promise<void> {
  await prisma.branch.create({ data: { id: KITCHEN_BRANCH_ID, name: 'E2E Kitchen', isActive: true } });
  // Explicit id above does not advance the sequence.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Branch"', 'id'), (SELECT MAX(id) FROM "Branch"))`,
  );

  // User.branchId is @unique: the manager holds the kitchen; admin and viewer have no branch.
  const users: Array<[typeof ADMIN, UserRole, number | null]> = [
    [ADMIN, UserRole.ADMIN, null],
    [MANAGER, UserRole.MANAGER, KITCHEN_BRANCH_ID],
    [VIEWER, UserRole.VIEWER, null],
  ];
  for (const [u, role, branchId] of users) {
    await prisma.user.create({
      data: {
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, BCRYPT_COST_FACTOR),
        role,
        branchId,
        isActive: true,
      },
    });
  }

  await prisma.jobRole.create({ data: { name: 'E2E Baker' } });
  await prisma.expenseCategory.create({ data: { name: 'E2E Supplies' } });
}
