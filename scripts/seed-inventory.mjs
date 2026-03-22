/**
 * Seed inventory for the past 7 days.
 *
 * Usage:
 *   node scripts/seed-inventory.mjs [email] [password] [apiUrl]
 *
 * Defaults:
 *   email   → admin@louella.com
 *   password → password
 *   apiUrl  → http://localhost:3000/api/v1
 *
 * The script will:
 *   1. Log in and obtain a bearer token
 *   2. Fetch all active products and active branches
 *   3. For each branch × each of the past 7 days:
 *        - Skip dates that already have entries for that branch
 *        - Generate realistic random delivery / leftover / reject values
 *        - POST to /inventory/bulk
 */

import axios from 'axios';

// ── Config ────────────────────────────────────────────────────────────────────
const EMAIL    = process.argv[2] ?? 'admin@louella.com';
const PASSWORD = process.argv[3] ?? 'secret123';
const BASE_URL = process.argv[4] ?? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1');

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Returns YYYY-MM-DD for `daysAgo` days before today */
function dateAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Random integer in [min, max] */
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate plausible inventory numbers for a product.
 * delivery: 5–40 units
 * leftover: 0–30 % of delivery
 * reject:   0–10 % of delivery (but leftover + reject ≤ delivery)
 */
function generateEntry(branchId, productId, date, prevLeftover = 0) {
  const delivery  = rand(5, 40);
  const maxOut    = delivery + prevLeftover;
  const leftover  = rand(0, Math.floor(maxOut * 0.30));
  const reject    = rand(0, Math.min(Math.floor(maxOut * 0.10), maxOut - leftover));
  return {
    branchId,
    productId,
    date,
    quantity: prevLeftover,   // prev leftover seed
    delivery,
    leftover,
    reject,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = axios.create({ baseURL: BASE_URL });

  // 1. Login
  console.log(`Logging in as ${EMAIL} …`);
  const loginRes = await client.post('/auth/login', { email: EMAIL, password: PASSWORD });
  const token = loginRes.data.accessToken;
  client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  console.log('  ✓ Authenticated');

  // 2. Fetch products & branches
  const [productsRes, branchesRes] = await Promise.all([
    client.get('/products'),
    client.get('/branches'),
  ]);

  const products = productsRes.data.filter((p) => p.isActive);
  const branches = branchesRes.data.filter((b) => b.isActive);

  console.log(`  Products: ${products.length} active`);
  products.forEach((p) => console.log(`    [${p.type}] ${p.name} (id=${p.id}, ₱${p.price})`));
  console.log(`  Branches: ${branches.length} active`);
  branches.forEach((b) => console.log(`    ${b.name} (id=${b.id})`));

  if (products.length === 0 || branches.length === 0) {
    console.error('No active products or branches found. Aborting.');
    process.exit(1);
  }

  // 3. Generate & post per branch × per day
  // days 7 → 1 (oldest first so the "prevLeftover" chain is correct)
  const dates = Array.from({ length: 7 }, (_, i) => dateAgo(7 - i));
  console.log(`\nSeed dates: ${dates.join(', ')}`);

  // Track leftover per (branchId, productId) across days
  const leftoverMap = new Map(); // key = `${branchId}:${productId}`

  let totalCreated = 0;
  let totalSkipped = 0;

  for (const date of dates) {
    for (const branch of branches) {
      // Fetch existing entries to avoid duplicates
      let existing = [];
      try {
        const r = await client.get(`/inventory/branch/${branch.id}/date`, { params: { date } });
        existing = Array.isArray(r.data) ? r.data : [];
      } catch {
        // 404 / empty is fine
      }
      const existingProductIds = new Set(existing.map((e) => e.productId));

      // Always seed leftoverMap from existing entries first so that any newly
      // generated entries for the same day use the correct prevLeftover, and so
      // the chain carries forward correctly even when entries are skipped.
      for (const e of existing) {
        leftoverMap.set(`${branch.id}:${e.productId}`, Math.max(0, e.leftover - e.reject));
      } 

      const payload = products
        .filter((p) => !existingProductIds.has(p.id))
        .map((p) => {
          const key = `${branch.id}:${p.id}`;
          const prev = leftoverMap.get(key) ?? 0;
          return generateEntry(branch.id, p.id, date, prev);
        });

      if (payload.length === 0) {
        console.log(`  [${date}] ${branch.name}: all ${products.length} products already exist — skipped`);
        totalSkipped += products.length;
        continue;
      }

      try {
        await client.post('/inventory/bulk', payload);
        console.log(`  [${date}] ${branch.name}: created ${payload.length} entr${payload.length === 1 ? 'y' : 'ies'}`);
        totalCreated += payload.length;
        // update leftover chain for next day
        for (const entry of payload) {
          leftoverMap.set(
            `${branch.id}:${entry.productId}`,
            Math.max(0, entry.leftover - entry.reject),
          );
        }
      } catch (err) {
        const msg = err?.response?.data?.message;
        console.error(
          `  [${date}] ${branch.name}: FAILED —`,
          Array.isArray(msg) ? msg.join(', ') : (msg ?? err.message),
        );
      }
    }
  }

  console.log(`\nDone. Created ${totalCreated} entries, skipped ${totalSkipped} existing.`);
}

main().catch((err) => {
  console.error('Fatal:', err?.response?.data ?? err.message);
  process.exit(1);
});
