import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertEnvComplete, assertSafeDatabase, envExampleKeys, loadE2eEnv } from './support/env';
import { seedBase } from './seed/base';
import { assertE2eServer } from './support/server';
import { ADMIN } from './support/credentials';

export default async function globalSetup(): Promise<void> {
  const env = loadE2eEnv();
  // FIRST: nothing below may run against anything but the local e2e database.
  assertSafeDatabase(env);
  assertEnvComplete(env, envExampleKeys());

  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_URL } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: env.DATABASE_URL, DIRECT_URL: env.DIRECT_URL },
  });

  const seeded = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    await seedBase(seeded);
  } finally {
    await seeded.$disconnect();
  }

  // Last: the seed is in, so the e2e admin must be able to log in through whatever is serving :4100.
  await assertE2eServer('http://localhost:4100', ADMIN);
}
