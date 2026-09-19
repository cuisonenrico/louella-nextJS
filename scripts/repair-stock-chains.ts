/**
 * One-off repair: make every stored opening stock equal the previous day's
 * close, for every finished-goods chain and every material stock-card chain.
 *
 * The writers keep chains current from now on (src/server/common/utils/
 * stock-chain.ts). History written before they did can still hold stale
 * openings — e.g. a material card edited after the next day's card existed.
 *
 *   npx tsx scripts/repair-stock-chains.ts            # dry run: report only
 *   npx tsx scripts/repair-stock-chains.ts --apply    # write the fixes
 *
 * Uses DATABASE_URL from .env. Everything runs in one transaction; the dry
 * run rolls it back, so it reports exactly what --apply would change.
 */
import { PrismaClient } from '@prisma/client';
import {
  reconcileInventoryChains,
  reconcileMaterialChains,
} from '../src/server/common/utils/stock-chain';

const apply = process.argv.includes('--apply');

class DryRunRollback extends Error {}

async function main() {
  const prisma = new PrismaClient();
  try {
    const [pairs, materials] = await Promise.all([
      prisma.inventory.groupBy({
        by: ['branchId', 'productId'],
        where: { deletedAt: null },
        _min: { date: true },
      }),
      prisma.materialInventory.groupBy({
        by: ['materialId'],
        where: { deletedAt: null },
        _min: { date: true },
      }),
    ]);

    let inventoryRows = 0;
    let materialCards = 0;
    try {
      await prisma.$transaction(
        async (tx) => {
          inventoryRows = await reconcileInventoryChains(
            tx,
            pairs.map((p) => ({
              branchId: p.branchId,
              productId: p.productId,
              fromDate: p._min.date!,
            })),
            { full: true },
          );
          materialCards = await reconcileMaterialChains(
            tx,
            materials.map((m) => ({ materialId: m.materialId, fromDate: m._min.date! })),
            { full: true },
          );
          if (!apply) throw new DryRunRollback();
        },
        { timeout: 300_000, maxWait: 20_000 },
      );
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }

    console.log(
      `${apply ? 'Rewrote' : 'Dry run — would rewrite'} ${inventoryRows} inventory row(s) ` +
        `across ${pairs.length} product chain(s), and ${materialCards} material card(s) ` +
        `across ${materials.length} material chain(s).` +
        (apply ? '' : ' Re-run with --apply to write.'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
