import { PrismaClient } from '@prisma/client';
import { FEATURES } from '../src/lib/rbac/features';

const prisma = new PrismaClient();

/**
 * Registers every feature key in the Feature table.
 *
 * The list is not repeated here — it is derived from the RBAC manifest, which
 * is the single source of truth. Both override tables have a foreign key onto
 * Feature.key, so a key missing from this table cannot be toggled by an admin.
 *
 * The same rows are inserted by the 20260819000000_seed_rbac_feature_registry
 * migration, so a migrated database already has them; this stays for local
 * databases built from seeds and as the manifest-derived reference.
 */
async function main() {
  for (const f of FEATURES) {
    await prisma.feature.upsert({
      where: { key: f.key },
      update: { label: f.label, description: f.description },
      create: { key: f.key, label: f.label, description: f.description },
    });
  }
  console.log('Seeded features:', FEATURES.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
