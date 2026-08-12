# Historical XLSX Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the full archive of fortnightly bakery XLSX workbooks into a cleared database as trustworthy inventory history, without silently merging distinct products or misvaluing historical revenue.

**Architecture:** Product identity stays a stable `Product.id`. Sheet labels are mapped to products through an explicit `ProductAlias` table resolved by *(label, section, optional price hint)* — never by price alone. Each workbook's `pricelist` tab is additionally harvested into `ProductPriceHistory` so historical revenue is valued at the price in force on that date. The importer refuses to guess: any label it cannot resolve to exactly one product aborts the sheet with a named error.

**Tech Stack:** NestJS 11 service (`src/server/inventory-import/`), Prisma + PostgreSQL (Supabase), SheetJS `xlsx` 0.20.3, Jest for server tests, plain `.mjs` node scripts for offline tooling.

## Global Constraints

- Work in `louella-web/`. `../louella-be/` is dead code — never edit it.
- Product identity is `Product.id`. **Price is never part of identity** — see "Why not name+price" below.
- No hard deletes. All operational tables use `deletedAt`.
- Dates: never derive from the system clock. Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`. Sheet dates are already explicit and parse to UTC midnight — keep that.
- Database is cross-region at ~300ms/statement. Every DB access added must be batched, never per-row or per-sheet.
- TDD is mandatory: write the failing test, watch it fail, then implement.
- Run `npm run test:server` and `npx tsc --noEmit` before every commit.
- After any `prisma/schema.prisma` change, run `npm run prisma:generate` in `louella-web/` with the dev server stopped (Windows `EPERM` on `query_engine-windows.dll.node` otherwise).

---

## Why not name+price (read before Task 1)

Name+price was the leading candidate for a composite identity. Measured against the two real workbooks, it fails:

- **Prices drift constantly.** Between two *consecutive* fortnights, 6 products were repriced: `Ham Pork Floss` 25→42, `Otap` 12→35, `Mushroom` 15→35, `Lambingan` 10→15, `Choco Buns` 17→15, `Merengue` 12→8. Against the seed catalog (sourced from a May 2025 file), **119 of 165 products** have a different price.
- With name+price as identity, `Otap@12` and `Otap@35` become two different products. One SKU's history fragments into a new row every time the client reprices — the opposite of what a history import is for.
- The schema already disagrees: `ProductPriceHistory` exists and `getEffectivePrice()` (`src/server/common/utils/price-history.util.ts:7`) is wired into revenue. Price is modelled as a time-varying attribute *of* a product, not as part of its key.

**What actually disambiguates the collisions is section context, not price.** In each day sheet a `Bote:` header (row ~154) opens a bottle-deposit block. `Litro`, `Kasalo`, `8oz`, `Cobra`, `Vitamilk` appear once under `Bote:` (deposit, ₱5–10) and again on PAGE 4 (the beverage itself, ₱20–45). `prisma/seed-products.sql:10` already records this convention: *"Bote deposits renamed with a ' (bote)' suffix to avoid beverage collisions."* The importer currently throws that context away — `isSkippableLabel()` skips `bote:` as noise.

So: **section resolves 5 of 7 collisions permanently. Price is used only as a last-resort tie-breaker for the remaining 2, scoped per file and validated.**

### Collision inventory (from the two known files)

| Sheet label | Variants | Resolves by |
|---|---|---|
| `Litro` | ₱10 (Bote:) / ₱45 (PAGE 4) | section |
| `Kasalo` | ₱10 (Bote:) / ₱35 (PAGE 4) | section |
| `Cobra` | ₱5 (Bote:) / ₱20 (PAGE 4) | section |
| `Vitamilk` | ₱5 (Bote:) / ₱25 (PAGE 4) | section |
| `8oz` | ₱5 (Bote:) / — | section (beverage variant absent from catalog) |
| `Bonette` | ₱30 / ₱8, both PAGE 3, no marker | **price hint — needs client decision** |
| `Pandesal Pack` | ₱40 / ₱1000, adjacent on PAGE 1 | **price hint — needs client decision** |
| `Pandesal`, `Spanish Bread` | same price, PAGE 1 + PAGE 2 | **not a collision** — two delivery batches, summing is correct |

### Known catalog gaps

`Peanut Butter L`, `Peanut Butter XL`, `8oz` are referenced by every sheet and absent from the catalog. Ten equipment labels (`Estante`, `Freezer`, `Ref`, `Trays`, `Board Stand`, `Thongs`, `Plancha`, `Wooden Estante/Cab`, `Ref-type Chiller`, `Cake Chiller (C2)`) are excluded from the catalog **on purpose** but currently surface as 160+ "Product not found" errors per file, drowning real problems.

### Already shipped (commit `3974f29`) — do not redo

Implausible-date guard (`MIN_PLAUSIBLE_YEAR`), all-zero sheet guard, `Expected Sales` label fix, `conflictMode: 'skip' | 'overwrite'` duplicate-date guard, and the upsert now setting `quantity: 0, isAutoGenerated: false`.

---

## File Structure

**Create:**
- `scripts/audit-import-workbooks.mjs` — offline audit across the whole archive. Emits the label/collision/price report that drives the client conversation. No DB access.
- `src/server/inventory-import/label-resolver.ts` — pure resolution logic: `(label, section, price) → productId | ambiguous | unmatched`. No Prisma, no XLSX; trivially testable.
- `src/server/inventory-import/label-resolver.spec.ts`
- `src/server/inventory-import/sheet-sections.ts` — walks sheet rows tracking the current section (`main` / `bote`) and the ignore-list.
- `src/server/inventory-import/sheet-sections.spec.ts`
- `scripts/backfill-price-history.mjs` — harvests each workbook's `pricelist` tab into `ProductPriceHistory`.
- `docs/HISTORICAL_IMPORT_RUNBOOK.md` — the operator runbook for the real import.

**Modify:**
- `prisma/schema.prisma` — add `ProductAlias`.
- `src/server/inventory-import/inventory-import.service.ts` — consume the resolver and section walker; fail loudly on ambiguity.
- `src/server/inventory-import/inventory-import.service.spec.ts`
- `src/types/index.ts` — extend `DryRunSheet` with `ambiguous`.
- `src/app/(app)/inventory-import/page.tsx` — surface ambiguous labels as a blocking error.

---

## Task 1: Archive audit tool

Nothing else can be decided until the full archive is measured. Two files are not a sample. This task produces the report the client decision depends on.

**Files:**
- Create: `scripts/audit-import-workbooks.mjs`
- Output: `docs/import-audit-report.md` (generated, committed once for the record)

**Interfaces:**
- Consumes: nothing (offline, reads `.xlsx` files from a directory argument)
- Produces: a markdown report. No code depends on it; later tasks depend on the *decisions* it informs.

- [ ] **Step 1: Write the audit script**

```javascript
// scripts/audit-import-workbooks.mjs
// Offline audit of every historical workbook. No database access.
// Usage: node scripts/audit-import-workbooks.mjs <dir-with-xlsx> > docs/import-audit-report.md
import * as XLSX from 'xlsx';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_SHEETS = new Set(['pricelist', 'Del Sheet', 'Prod Sheet', 'Blank columns and rows']);
const isDaySheet = (n) => !SKIP_SHEETS.has(n) && /^Day\s*(0|\(\d+\))$/i.test(n);

function readPricelist(wb) {
  const ws = wb.Sheets['pricelist'];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const out = [];
  for (const r of aoa) {
    const name = r?.[0] != null ? String(r[0]).trim() : '';
    const rawPrice = r?.[1] != null ? String(r[1]).trim() : '';
    if (!name || !rawPrice) continue;
    if (/^(products|page\s+\d+)$/i.test(name)) continue;
    const price = parseFloat(rawPrice.replace(/[^\d.\-]/g, ''));
    if (Number.isNaN(price)) continue;
    out.push({ name, price });
  }
  return out;
}

function firstSheetDate(wb) {
  for (const sn of wb.SheetNames) {
    if (!isDaySheet(sn)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false });
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(k)) {
          const [m, d, y] = k.split('/').map(Number);
          const year = y < 100 ? 2000 + y : y;
          if (year < 2020) continue;
          return new Date(Date.UTC(year, m - 1, d)).toISOString().slice(0, 10);
        }
      }
    }
  }
  return null;
}

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/audit-import-workbooks.mjs <dir>'); process.exit(1); }
const files = readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f)).sort();

const perFile = [];
const priceTimeline = new Map(); // name -> [{date, prices:[]}]

for (const f of files) {
  const wb = XLSX.read(readFileSync(join(dir, f)), { type: 'buffer', cellDates: true });
  const date = firstSheetDate(wb);
  const list = readPricelist(wb);
  const byName = new Map();
  for (const { name, price } of list) {
    const k = name.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(price);
  }
  const collisions = [...byName].filter(([, p]) => p.length > 1 && new Set(p).size > 1);
  perFile.push({ file: f, date, skuCount: list.length, collisions });
  for (const [k, prices] of byName) {
    if (!priceTimeline.has(k)) priceTimeline.set(k, []);
    priceTimeline.get(k).push({ date, prices: [...new Set(prices)].sort((a, b) => a - b) });
  }
}

console.log('# Import audit report\n');
console.log(`Files scanned: ${files.length}\n`);

console.log('## Per-file summary\n');
console.log('| File | First date | SKUs | Colliding names |');
console.log('|---|---|---|---|');
for (const p of perFile) {
  const c = p.collisions.map(([n, pr]) => `${n} (${pr.join('/')})`).join('; ') || '—';
  console.log(`| ${p.file} | ${p.date ?? 'NONE'} | ${p.skuCount} | ${c} |`);
}

console.log('\n## Names that ever collide (need an alias decision)\n');
const everCollide = new Set();
for (const p of perFile) for (const [n] of p.collisions) everCollide.add(n);
for (const n of [...everCollide].sort()) {
  console.log(`- **${n}** — variants over time: ` +
    priceTimeline.get(n).map((t) => `${t.date}:[${t.prices.join(',')}]`).join(' '));
}
if (everCollide.size === 0) console.log('_none_');

console.log('\n## Price drift (single-variant names whose price changed)\n');
for (const [n, timeline] of [...priceTimeline].sort()) {
  if (everCollide.has(n)) continue;
  const distinct = [...new Set(timeline.map((t) => t.prices.join(',')))];
  if (distinct.length > 1) {
    console.log(`- **${n}**: ` + timeline.map((t) => `${t.date}=${t.prices.join(',')}`).join(' → '));
  }
}
```

- [ ] **Step 2: Run it against the full archive**

Collect every historical workbook into one directory first, then:

```bash
cd louella-web
node scripts/audit-import-workbooks.mjs "D:/Downloads/louella-history" > docs/import-audit-report.md
```

Expected: a report listing every file, its first date, its SKU count, and every colliding name with its price variants over time.

- [ ] **Step 3: Sanity-check the report against the two known files**

Confirm the "Names that ever collide" section contains at least `bonette`, `cobra`, `kasalo`, `litro`, `pandesal pack`, `vitamilk`. If any is missing the parser is wrong — fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add scripts/audit-import-workbooks.mjs docs/import-audit-report.md
git commit -m "chore(import): add archive audit tool and baseline report"
```

### Client decision gate

Take `docs/import-audit-report.md` to the client and settle, for **every** name in the collide list:

1. Is it one product or two? (`Bonette` ₱30 vs ₱8 — different size, or a repricing?)
2. If two, what should each be called? Follow the existing `(bote)` convention, e.g. `Bonette Large` / `Bonette Small`.
3. Going forward, rename them in the workbook template so future files are unambiguous at source.

Record the answers in `docs/import-audit-report.md` under a `## Decisions` heading. Tasks 2 and 4 encode them.

---

## Task 2: ProductAlias schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npm run prisma:migrate`

**Interfaces:**
- Produces: Prisma model `ProductAlias { id, productId, sheetLabel, section, priceHint, notes, createdAt }` with unique `[sheetLabel, section, priceHint]`, consumed by Tasks 4 and 6.

- [ ] **Step 1: Add the model**

Insert after the `Product` model in `prisma/schema.prisma`:

```prisma
// Maps a label as it appears in column A of an imported day sheet to a
// product. Sheet labels are ambiguous in two ways: the same word names a
// beverage and its bottle deposit (resolved by `section`), and in a few
// legacy cases two distinct SKUs share a name (resolved by `priceHint`).
// Price is a disambiguator only — never part of product identity, because
// prices are repriced constantly (see ProductPriceHistory).
model ProductAlias {
  id         Int      @id @default(autoincrement())
  productId  Int
  sheetLabel String   // lowercased, trimmed, exactly as it appears in col A
  section    String?  // 'bote' for the deposit block; null = main body
  priceHint  Decimal? @db.Decimal(10, 2) // last-resort tie-break within one file
  notes      String?
  createdAt  DateTime @default(now())

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([sheetLabel, section, priceHint])
  @@index([productId]) // FK columns are not auto-indexed by Postgres
  @@index([sheetLabel])
}
```

Add the back-relation inside `model Product`, next to `priceHistory`:

```prisma
  aliases      ProductAlias[]
```

- [ ] **Step 2: Generate the migration**

Stop the dev server first (Windows file-lock), then:

```bash
cd louella-web
npm run prisma:migrate -- --name add_product_alias
```

Expected: a new folder under `prisma/migrations/` and `prisma generate` succeeding.

- [ ] **Step 3: Harden the unique constraint against NULLs**

**This step is not optional.** `@@unique([sheetLabel, section, priceHint])` does *not* do what it looks like it does. In Postgres, NULLs compare as distinct in a unique index, so two rows with `section = NULL, priceHint = NULL` and the same `sheetLabel` both insert happily — precisely the duplicate-alias case that would reintroduce silent mis-resolution. Prisma cannot express `NULLS NOT DISTINCT` in `@@unique`, so add a raw expression index to the generated migration file.

Append to the migration SQL just created under `prisma/migrations/<timestamp>_add_product_alias/migration.sql`:

```sql
-- Prisma's @@unique leaves NULL section / priceHint rows non-distinct, which
-- would allow two conflicting aliases for the same label. COALESCE the
-- nullable columns to sentinels so the constraint actually holds. -1 is safe
-- as a price sentinel because prices are non-negative.
DROP INDEX IF EXISTS "ProductAlias_sheetLabel_section_priceHint_key";

CREATE UNIQUE INDEX "ProductAlias_lookup_key"
  ON "ProductAlias" ("sheetLabel", COALESCE(section, ''), COALESCE("priceHint", -1));
```

Because the schema and the database now differ on that one index, record it so `prisma migrate dev` does not try to "fix" it later — add to `prisma/schema.prisma` above the model:

```prisma
/// NOTE: the [sheetLabel, section, priceHint] uniqueness is enforced in SQL by
/// the ProductAlias_lookup_key expression index (COALESCE on the nullable
/// columns), not by the @@unique below, which Postgres would treat as
/// NULLS DISTINCT. Keep both; drop neither.
```

- [ ] **Step 4: Apply and prove the constraint bites**

```bash
npm run prisma:migrate
```

Then verify the duplicate is actually rejected:

```sql
INSERT INTO "ProductAlias" ("productId", "sheetLabel", section, "priceHint")
VALUES (1, 'dupe-test', NULL, NULL);
-- second insert must fail with a unique violation
INSERT INTO "ProductAlias" ("productId", "sheetLabel", section, "priceHint")
VALUES (1, 'dupe-test', NULL, NULL);
DELETE FROM "ProductAlias" WHERE "sheetLabel" = 'dupe-test';
```

Expected: the second `INSERT` errors with `duplicate key value violates unique constraint "ProductAlias_lookup_key"`. If it succeeds, the raw index did not apply — fix before continuing.

- [ ] **Step 5: Verify the client compiles**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(import): add ProductAlias for sheet-label disambiguation"
```

---

## Task 3: Section-aware row walking

The `Bote:` header is currently discarded as noise. This task preserves it as row context and folds in the equipment ignore-list.

**Files:**
- Create: `src/server/inventory-import/sheet-sections.ts`
- Test: `src/server/inventory-import/sheet-sections.spec.ts`

**Interfaces:**
- Produces:
  - `type SheetSection = 'main' | 'bote'`
  - `function sectionForRow(label: string, current: SheetSection): SheetSection` — returns the section in force *after* seeing `label`.
  - `function isIgnoredLabel(label: string): boolean` — equipment and fixtures the catalog deliberately excludes.
  - Both consumed by Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/inventory-import/sheet-sections.spec.ts
import { sectionForRow, isIgnoredLabel } from './sheet-sections';

describe('sectionForRow', () => {
  it('enters the bote section on a "Bote:" header', () => {
    expect(sectionForRow('Bote:', 'main')).toBe('bote');
  });

  it('stays in the bote section for following product rows', () => {
    expect(sectionForRow('Litro', 'bote')).toBe('bote');
  });

  it('leaves the bote section at the next PAGE header', () => {
    expect(sectionForRow('PAGE 4', 'bote')).toBe('main');
  });

  it('leaves the bote section at a TOTAL row', () => {
    expect(sectionForRow('TOTAL', 'bote')).toBe('main');
  });
});

describe('isIgnoredLabel', () => {
  it.each(['Estante', 'Freezer', 'Ref', 'Trays', 'Wooden Estante/Cab', 'Cake Chiller (C2)'])(
    'ignores the equipment label %s',
    (label) => {
      expect(isIgnoredLabel(label)).toBe(true);
    },
  );

  it('does not ignore a real product', () => {
    expect(isIgnoredLabel('Pandesal')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/server/inventory-import/sheet-sections.spec.ts
```

Expected: FAIL — `Cannot find module './sheet-sections'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/server/inventory-import/sheet-sections.ts

/**
 * Which block of a day sheet a row belongs to. The bakery sheets list a
 * beverage and its bottle deposit under the same word — `Litro` at ₱45 is
 * the drink, `Litro` at ₱10 under the `Bote:` header is the empty bottle.
 * Section is the stable discriminator; price is not (drinks get repriced).
 */
export type SheetSection = 'main' | 'bote';

/** The section in force after reading `label` in column A. */
export function sectionForRow(
  label: string,
  current: SheetSection,
): SheetSection {
  const s = label.trim();
  if (/^bote:$/i.test(s)) return 'bote';
  // A page break or a totals line closes the deposit block.
  if (/^page\s+\d+$/i.test(s) || /^total$/i.test(s)) return 'main';
  return current;
}

/**
 * Fixtures and equipment the bakery counts on the same sheet but which are
 * deliberately absent from the product catalog (see prisma/seed-products.sql:
 * "Equipment excluded entirely"). Without this list every import reports
 * ~160 spurious "Product not found" errors and buries the real ones.
 */
const IGNORED_LABELS = new Set(
  [
    'estante',
    'freezer',
    'ref',
    'trays',
    'board stand',
    'thongs',
    'plancha',
    'wooden estante/cab',
    'ref-type chiller',
    'cake chiller (c2)',
  ].map((s) => s.toLowerCase()),
);

export function isIgnoredLabel(label: string): boolean {
  return IGNORED_LABELS.has(label.trim().toLowerCase());
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/server/inventory-import/sheet-sections.spec.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/inventory-import/sheet-sections.ts src/server/inventory-import/sheet-sections.spec.ts
git commit -m "feat(import): track Bote section context and ignore equipment labels"
```

---

## Task 4: Alias-based label resolution

**Files:**
- Create: `src/server/inventory-import/label-resolver.ts`
- Test: `src/server/inventory-import/label-resolver.spec.ts`

**Interfaces:**
- Consumes: `SheetSection` from Task 3.
- Produces:
  - `interface AliasRow { sheetLabel: string; section: string | null; priceHint: number | null; productId: number }`
  - `type Resolution = { kind: 'matched'; productId: number } | { kind: 'ambiguous'; reason: string } | { kind: 'unmatched' }`
  - `class LabelResolver { constructor(aliases: AliasRow[], catalog: Map<string, number[]>); resolve(label: string, section: SheetSection, price: number | null): Resolution }`
  - Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```typescript
// src/server/inventory-import/label-resolver.spec.ts
import { LabelResolver, type AliasRow } from './label-resolver';

const catalog = new Map<string, number[]>([
  ['pandesal', [8]],
  ['litro', [147]],
  ['litro (bote)', [128]],
  ['bonette', [119, 120]], // two products share this name
]);

const aliases: AliasRow[] = [
  { sheetLabel: 'litro', section: 'bote', priceHint: null, productId: 128 },
  { sheetLabel: 'bonette', section: null, priceHint: 30, productId: 119 },
  { sheetLabel: 'bonette', section: null, priceHint: 8, productId: 120 },
];

describe('LabelResolver', () => {
  it('resolves an unambiguous catalog name', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Pandesal', 'main', 3)).toEqual({ kind: 'matched', productId: 8 });
  });

  it('routes a bote-section label to the deposit product', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Litro', 'bote', 10)).toEqual({ kind: 'matched', productId: 128 });
  });

  it('routes the same label in the main section to the beverage', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Litro', 'main', 45)).toEqual({ kind: 'matched', productId: 147 });
  });

  it('uses the price hint when a name maps to two products', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Bonette', 'main', 8)).toEqual({ kind: 'matched', productId: 120 });
  });

  it('reports ambiguity rather than guessing when the price hint misses', () => {
    const r = new LabelResolver(aliases, catalog);
    const res = r.resolve('Bonette', 'main', 99);
    expect(res.kind).toBe('ambiguous');
    expect((res as { reason: string }).reason).toMatch(/Bonette/);
  });

  it('reports unmatched for a name absent from catalog and aliases', () => {
    const r = new LabelResolver(aliases, catalog);
    expect(r.resolve('Peanut Butter XL', 'main', 90)).toEqual({ kind: 'unmatched' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/server/inventory-import/label-resolver.spec.ts
```

Expected: FAIL — `Cannot find module './label-resolver'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/server/inventory-import/label-resolver.ts
import type { SheetSection } from './sheet-sections';

export interface AliasRow {
  sheetLabel: string; // lowercased, trimmed
  section: string | null; // 'bote' | null
  priceHint: number | null;
  productId: number;
}

export type Resolution =
  | { kind: 'matched'; productId: number }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'unmatched' };

/**
 * Maps a sheet label to exactly one product, or refuses.
 *
 * Order of preference, most specific first:
 *   1. alias on (label, section, price)
 *   2. alias on (label, section)
 *   3. alias on (label)
 *   4. catalog name, but only when the name is unique in the catalog
 *
 * A name that maps to several products with no alias to separate them is
 * reported as `ambiguous`, never silently summed into one of them.
 */
export class LabelResolver {
  private readonly byKey = new Map<string, number>();

  constructor(
    aliases: AliasRow[],
    private readonly catalog: Map<string, number[]>,
  ) {
    for (const a of aliases) {
      this.byKey.set(
        LabelResolver.key(a.sheetLabel, a.section, a.priceHint),
        a.productId,
      );
    }
  }

  private static key(
    label: string,
    section: string | null,
    price: number | null,
  ): string {
    return `${label}|${section ?? ''}|${price ?? ''}`;
  }

  resolve(
    label: string,
    section: SheetSection,
    price: number | null,
  ): Resolution {
    const name = label.trim().toLowerCase();
    const sec = section === 'bote' ? 'bote' : null;

    const candidates = [
      LabelResolver.key(name, sec, price),
      LabelResolver.key(name, sec, null),
      LabelResolver.key(name, null, price),
      LabelResolver.key(name, null, null),
    ];
    for (const k of candidates) {
      const hit = this.byKey.get(k);
      if (hit !== undefined) return { kind: 'matched', productId: hit };
    }

    const products = this.catalog.get(name) ?? [];
    if (products.length === 1) return { kind: 'matched', productId: products[0] };
    if (products.length > 1) {
      return {
        kind: 'ambiguous',
        reason:
          `"${label.trim()}" matches ${products.length} products ` +
          `(ids ${products.join(', ')}) and no alias resolves it at ` +
          `price ${price ?? 'n/a'} in section ${section}`,
      };
    }
    return { kind: 'unmatched' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest src/server/inventory-import/label-resolver.spec.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/inventory-import/label-resolver.ts src/server/inventory-import/label-resolver.spec.ts
git commit -m "feat(import): add alias-based label resolver that refuses to guess"
```

---

## Task 5: Wire the resolver into the importer

**Files:**
- Modify: `src/server/inventory-import/inventory-import.service.ts`
- Modify: `src/server/inventory-import/inventory-import.service.spec.ts`
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: `LabelResolver`, `Resolution` (Task 4); `sectionForRow`, `isIgnoredLabel` (Task 3).
- Produces: `DryRunSheet.ambiguous: string[]`; a sheet with any ambiguous label is skipped by `importWorkbook` with a per-sheet error.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('importWorkbook', ...)` block in `inventory-import.service.spec.ts`.

**Watch out:** the existing `buildSheet` helper hardcodes column B (the price column the resolver reads) to the string `'0'` for every data row. That is fine for the two tests below — they exercise the *ambiguous* and *ignored* paths, where no price hint should match anyway. But it means you **cannot** test price-hint resolution through `buildWorkbook`. Price-hint behaviour is covered by `label-resolver.spec.ts` (Task 4), which tests the resolver directly. If you later want an end-to-end price-hint test, extend `buildSheet` to take a per-row price rather than assuming it works.

```typescript
    it('refuses a sheet containing an ambiguous label instead of summing it', async () => {
      prisma.product.findMany.mockResolvedValue([
        { id: 119, name: 'Bonette' },
        { id: 120, name: 'Bonette' }, // same name, two products
      ]);
      prisma.productAlias.findMany.mockResolvedValue([]); // nothing disambiguates
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [['Bonette', 5, 2, 0]],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(prisma.inventory.upsert).not.toHaveBeenCalled();
      expect(res.sheets[0].processed).toBe(0);
      expect(res.sheets[0].errors[0]).toMatch(/matches 2 products/);
    });

    it('does not report ignored equipment labels as errors', async () => {
      prisma.product.findMany.mockResolvedValue([{ id: 1, name: 'Pandesal' }]);
      prisma.productAlias.findMany.mockResolvedValue([]);
      const buf = buildWorkbook([
        {
          name: 'Day (1)',
          dateHeader: '4/14/26',
          rows: [
            ['Pandesal', 10, 3, 1],
            ['Estante', 0, 0, 0],
            ['Freezer', 0, 0, 0],
          ],
        },
      ]);

      const res = await service.importWorkbook(buf, 7, 'sheet.xlsx');

      expect(res.sheets[0].processed).toBe(1);
      expect(res.sheets[0].skipped).toBe(0);
      expect(res.sheets[0].errors).toEqual([]);
    });
```

Add `productAlias: { findMany: jest.fn() }` to `makePrisma()` and `prisma.productAlias.findMany.mockResolvedValue([]);` to the `beforeEach` defaults.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest src/server/inventory-import/inventory-import.service.spec.ts
```

Expected: FAIL — the ambiguous test sees `upsert` called once (current code sums both `Bonette` rows into whichever id wins the name map); the equipment test sees `skipped: 2`.

- [ ] **Step 3: Implement**

In `inventory-import.service.ts`, replace `buildProductMap` with a catalog builder that keeps *all* ids per name, and add an alias loader:

```typescript
  private async buildCatalog(): Promise<Map<string, number[]>> {
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const catalog = new Map<string, number[]>();
    for (const p of products) {
      const key = p.name.trim().toLowerCase();
      const list = catalog.get(key);
      if (list) list.push(p.id);
      else catalog.set(key, [p.id]);
    }
    return catalog;
  }

  private async buildResolver(): Promise<LabelResolver> {
    const [catalog, aliasRows] = await Promise.all([
      this.buildCatalog(),
      this.prisma.productAlias.findMany({
        select: {
          sheetLabel: true,
          section: true,
          priceHint: true,
          productId: true,
        },
      }),
    ]);
    return new LabelResolver(
      aliasRows.map((a) => ({
        sheetLabel: a.sheetLabel,
        section: a.section,
        priceHint: a.priceHint === null ? null : Number(a.priceHint),
        productId: a.productId,
      })),
      catalog,
    );
  }
```

Replace `collectSheetEntries` so it walks with section state and returns ambiguity:

```typescript
  private collectSheetEntries(
    rows: Record<string, unknown>[],
    dateKey: string,
    resolver: LabelResolver,
  ): {
    accumulator: Map<number, Counts>;
    unmatched: string[];
    ambiguous: string[];
  } {
    const accumulator = new Map<number, Counts>();
    const unmatched: string[] = [];
    const ambiguous: string[] = [];
    let section: SheetSection = 'main';

    for (const row of rows) {
      const rawName = row['PAGE 1'];
      if (typeof rawName !== 'string') continue;
      const productName = rawName.trim();

      // Section headers are themselves skippable labels, so update the
      // section before the skip test discards the row.
      section = sectionForRow(productName, section);

      if (isSkippableLabel(productName)) continue;
      if (isIgnoredLabel(productName)) continue;

      const price = parsePrice(row['__EMPTY']);
      const res = resolver.resolve(productName, section, price);
      if (res.kind === 'ambiguous') {
        ambiguous.push(res.reason);
        continue;
      }
      if (res.kind === 'unmatched') {
        unmatched.push(productName);
        continue;
      }

      const delivery = parseCount(row['__EMPTY_1']);
      const leftover = parseCount(row['__EMPTY_3']);
      const reject = parseCount(row[dateKey]);
      const existing = accumulator.get(res.productId);
      if (existing) {
        existing.delivery += delivery;
        existing.leftover += leftover;
        existing.reject += reject;
      } else {
        accumulator.set(res.productId, { delivery, leftover, reject });
      }
    }
    return { accumulator, unmatched, ambiguous };
  }
```

Add the price parser next to `parseCount`:

```typescript
/** Column B holds the unit price as a formatted string, e.g. "36.00". */
function parsePrice(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).trim().replace(/[^\d.\-]/g, ''));
  return Number.isNaN(n) ? null : n;
}
```

Add the imports at the top of the service:

```typescript
import { LabelResolver } from './label-resolver';
import {
  isIgnoredLabel,
  sectionForRow,
  type SheetSection,
} from './sheet-sections';
```

In `importWorkbook`, swap `buildProductMap()` for `buildResolver()`, pass the resolver to `collectSheetEntries`, and abort the sheet on ambiguity — place this immediately after the `collectSheetEntries` call and before the all-zero guard:

```typescript
      if (ambiguous.length > 0) {
        for (const reason of ambiguous) result.errors.push(reason);
        result.errors.push(
          `${result.date}: sheet skipped — resolve the ambiguous labels with ` +
            `a ProductAlias before importing`,
        );
        sheetResults.push(result);
        continue;
      }
```

Mirror the same changes in `dryRunWorkbook`, populating a new `ambiguous` field on each `DryRunSheet`.

- [ ] **Step 4: Add `ambiguous` to both `DryRunSheet` declarations**

In `src/server/inventory-import/inventory-import.service.ts` and `src/types/index.ts`:

```typescript
  ambiguous: string[]; // labels matching several products with no alias
```

- [ ] **Step 5: Run the tests**

```bash
npx jest src/server/inventory-import/
npm run test:server
npx tsc --noEmit
```

Expected: all pass. Existing tests that relied on `buildProductMap` still pass because a uniquely-named product resolves through the catalog path.

- [ ] **Step 6: Commit**

```bash
git add src/server/inventory-import src/types/index.ts
git commit -m "feat(import): resolve labels via aliases and refuse ambiguous names"
```

---

## Task 6: Seed the aliases and missing products

Encodes the client decisions from Task 1's gate.

**Files:**
- Create: `prisma/seed-product-aliases.sql`

**Interfaces:**
- Consumes: the `ProductAlias` model (Task 2), the decisions recorded in `docs/import-audit-report.md`.
- Produces: alias rows the resolver (Task 4) reads.

- [ ] **Step 1: Add the missing catalog products**

```sql
-- prisma/seed-product-aliases.sql
-- Run AFTER seed-products.sql.
BEGIN;

-- Catalog gaps found by the archive audit: referenced by every day sheet,
-- absent from the original seed.
INSERT INTO "Product" (name, type, "sortOrder", price, "isActive", date, "createdAt")
VALUES
  ('Peanut Butter L',  'MISCELLANEOUS', 900, 0.00, true, NOW(), NOW()),
  ('Peanut Butter XL', 'MISCELLANEOUS', 901, 0.00, true, NOW(), NOW()),
  ('8oz',              'MISCELLANEOUS', 902, 0.00, true, NOW(), NOW())
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Add the section aliases**

The `(bote)` products already exist from `seed-products.sql` (ids 128–132). Map the bare labels in the deposit section onto them:

```sql
-- Bottle deposits: the same word as the beverage, under the "Bote:" header.
INSERT INTO "ProductAlias" ("productId", "sheetLabel", section, "priceHint", notes)
SELECT p.id, v.label, 'bote', NULL, 'deposit variant; resolved by sheet section'
FROM (VALUES
  ('litro',    'Litro (bote)'),
  ('kasalo',   'Kasalo (bote)'),
  ('cobra',    'Cobra (bote)'),
  ('vitamilk', 'Vitamilk (bote)'),
  ('8oz',      '8oz (bote)')
) AS v(label, product_name)
JOIN "Product" p ON p.name = v.product_name AND p."deletedAt" IS NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Add the price-hint aliases**

Fill in from the client's decisions. The example below assumes `Bonette` ₱30 and ₱8 are two sizes and `Pandesal Pack` ₱1000 is a bulk sack — **replace with the real answers before running**:

```sql
-- Two SKUs share one label with no section marker; the sheet's price column
-- is the only discriminator available in the historical files.
INSERT INTO "Product" (name, type, "sortOrder", price, "isActive", date, "createdAt")
VALUES
  ('Bonette Small',      'SPECIAL', 903, 8.00,    true, NOW(), NOW()),
  ('Pandesal Sack',      'BREAD',   904, 1000.00, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO "ProductAlias" ("productId", "sheetLabel", section, "priceHint", notes)
SELECT p.id, v.label, NULL, v.price::numeric, v.note
FROM (VALUES
  ('bonette',       30.00, 'Bonette',       'large; PAGE 3 first occurrence'),
  ('bonette',        8.00, 'Bonette Small', 'small; PAGE 3 second occurrence'),
  ('pandesal pack',  40.00, 'Pandesal Pack', 'retail pack'),
  ('pandesal pack', 1000.00,'Pandesal Sack', 'bulk sack')
) AS v(label, price, product_name, note)
JOIN "Product" p ON p.name = v.product_name AND p."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

COMMIT;
```

- [ ] **Step 4: Apply and verify no ambiguity remains**

```bash
psql "$DATABASE_URL" -f prisma/seed-product-aliases.sql
```

Then dry-run one workbook through the API and confirm `ambiguous` is empty for every sheet. If it is not, the reported reason names the label — add the missing alias and re-run.

- [ ] **Step 5: Commit**

```bash
git add prisma/seed-product-aliases.sql
git commit -m "feat(import): seed product aliases and missing catalog entries"
```

---

## Task 7: Backfill price history from the pricelist tabs

Without this, two years of imported sales are valued at today's price. Each workbook's `pricelist` tab is a dated price snapshot — exactly what `ProductPriceHistory` wants.

**Files:**
- Create: `scripts/backfill-price-history.mjs`

**Interfaces:**
- Consumes: `ProductAlias` (Task 2/6), the workbook archive.
- Produces: `ProductPriceHistory` rows consumed by `getEffectivePrice()` (`src/server/common/utils/price-history.util.ts:7`).

- [ ] **Step 1: Write the script**

```javascript
// scripts/backfill-price-history.mjs
// Harvests each workbook's `pricelist` tab into ProductPriceHistory, using the
// workbook's first day sheet as effectiveAt. Idempotent: skips a row when an
// identical (productId, price, effectiveAt) already exists.
// Usage: node scripts/backfill-price-history.mjs <dir-with-xlsx>
import * as XLSX from 'xlsx';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/backfill-price-history.mjs <dir>'); process.exit(1); }

const SKIP = new Set(['pricelist', 'Del Sheet', 'Prod Sheet', 'Blank columns and rows']);
const isDay = (n) => !SKIP.has(n) && /^Day\s*(0|\(\d+\))$/i.test(n);

function firstDate(wb) {
  for (const sn of wb.SheetNames) {
    if (!isDay(sn)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false });
    for (const row of rows) for (const k of Object.keys(row)) {
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(k)) {
        const [m, d, y] = k.split('/').map(Number);
        const year = y < 100 ? 2000 + y : y;
        if (year < 2020) continue;
        return new Date(Date.UTC(year, m - 1, d));
      }
    }
  }
  return null;
}

const catalog = new Map();
for (const p of await prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })) {
  const k = p.name.trim().toLowerCase();
  if (!catalog.has(k)) catalog.set(k, []);
  catalog.get(k).push(p.id);
}
const aliases = new Map();
for (const a of await prisma.productAlias.findMany()) {
  aliases.set(`${a.sheetLabel}|${a.priceHint === null ? '' : Number(a.priceHint)}`, a.productId);
}

let inserted = 0, skipped = 0;
for (const f of readdirSync(dir).filter((x) => /\.xlsx?$/i.test(x)).sort()) {
  const wb = XLSX.read(readFileSync(join(dir, f)), { type: 'buffer', cellDates: true });
  const effectiveAt = firstDate(wb);
  if (!effectiveAt) { console.warn(`${f}: no usable date, skipped`); continue; }

  const aoa = XLSX.utils.sheet_to_json(wb.Sheets['pricelist'], { header: 1, defval: null, raw: false });
  const rows = [];
  for (const r of aoa) {
    const name = r?.[0] != null ? String(r[0]).trim() : '';
    const raw = r?.[1] != null ? String(r[1]).trim() : '';
    if (!name || !raw || /^(products|page\s+\d+)$/i.test(name)) continue;
    const price = parseFloat(raw.replace(/[^\d.\-]/g, ''));
    if (Number.isNaN(price)) continue;
    const key = name.toLowerCase();
    const pid = aliases.get(`${key}|${price}`) ?? aliases.get(`${key}|`) ??
      ((catalog.get(key) ?? []).length === 1 ? catalog.get(key)[0] : null);
    if (pid === null) { skipped++; continue; }
    rows.push({ productId: pid, price, effectiveAt });
  }

  for (const row of rows) {
    const exists = await prisma.productPriceHistory.findFirst({
      where: { productId: row.productId, price: row.price, effectiveAt: row.effectiveAt },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.productPriceHistory.create({ data: row });
    inserted++;
  }
  console.log(`${f}: ${effectiveAt.toISOString().slice(0, 10)} — ${rows.length} prices`);
}
console.log(`\ninserted=${inserted} unresolved=${skipped}`);
await prisma.$disconnect();
```

- [ ] **Step 2: Dry-check resolution before writing**

Run it once against a copy of the database, or temporarily comment out the two `prisma.productPriceHistory` calls and confirm `unresolved=0`. A non-zero count means a pricelist label has no alias — fix in Task 6 first.

- [ ] **Step 3: Run it**

```bash
cd louella-web
node scripts/backfill-price-history.mjs "D:/Downloads/louella-history"
```

Expected: one line per file, `unresolved=0`.

- [ ] **Step 4: Spot-check a repriced product**

```sql
SELECT p.name, h.price, h."effectiveAt"
FROM "ProductPriceHistory" h JOIN "Product" p ON p.id = h."productId"
WHERE p.name = 'Otap' ORDER BY h."effectiveAt";
```

Expected: distinct prices at distinct dates (12 then 35 across the two known fortnights).

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-price-history.mjs
git commit -m "feat(import): backfill ProductPriceHistory from workbook pricelists"
```

---

## Task 8: Full-archive dry run and reconciliation

Prove the import is right *before* writing inventory.

**Files:**
- Create: `docs/HISTORICAL_IMPORT_RUNBOOK.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the operator runbook and a signed-off reconciliation.

- [ ] **Step 1: Dry-run every workbook**

For each file, `POST /api/v1/inventory-import/preview` with the target `branchId`. Record per sheet: date, matched, unmatched, ambiguous, existing.

Acceptance gate — **all four must hold for every file**:
1. `ambiguous` is empty everywhere.
2. `unmatched` contains only names the client has confirmed are not products.
3. Every `Day (1)`–`Day (15)` sheet has a plausible date; `Day 0` and `Day (16)/(17)` are skipped by the guards from `3974f29`.
4. `datesDetected` across all files is contiguous with no gaps and no duplicates other than the known `Day 0` overlap.

- [ ] **Step 2: Reconcile against the sheets' own totals**

Each day sheet carries a `TOTAL` row (column D/F/H) and a per-product computed sales column. Compare the importer's per-sheet `sumDelivery`/`sumLeftover`/`sumReject` against those totals for a sample of at least 5 sheets spread across the archive. A mismatch means a column-mapping regression — stop and investigate.

- [ ] **Step 3: Write the runbook**

```markdown
# Historical XLSX import runbook

## Preconditions
- `ProductAlias` seeded; a dry run of every workbook reports zero ambiguous labels.
- `ProductPriceHistory` backfilled (`scripts/backfill-price-history.mjs`).
- Database cleared of inventory, or the target dates confirmed empty.

## Order
Import **chronologically, oldest first**. Each workbook's `Day 0` is a blank
carry-in tab dated the previous workbook's last real day; the all-zero guard
skips it, but chronological order keeps the leftover carry-forward coherent.

## Per file
1. `POST /inventory-import/preview` with `branchId` — check `ambiguous` is empty.
2. `POST /inventory-import/import` with `branchId`, `conflictMode=skip`.
3. Confirm the response: 15 sheets processed, `Day 0` / `Day (16)` / `Day (17)` skipped with the expected guard messages.
4. Record the `ImportLog` id.

## Re-importing a corrected file
The SHA-256 duplicate guard rejects an identical file. For a corrected file,
import with `conflictMode=overwrite` — it replaces the days it covers.

## After the last file
Inventory ends at the archive's final date. On-demand autofill only back-fills
7 days, so the span from that date to (today − 7) stays empty. Close it
deliberately:

    POST /api/v1/jobs/autofill-range  { "startDate": "<last+1>", "endDate": "<today>" }

(MANAGER role; capped at 365 days per call.)

## Verification queries
    -- row count per date
    SELECT date, COUNT(*) FROM "Inventory" GROUP BY date ORDER BY date;
    -- days that are entirely zero (should be none among imported dates)
    SELECT date FROM "Inventory" GROUP BY date
    HAVING SUM(delivery) = 0 AND SUM(leftover) = 0 AND SUM(reject) = 0;
    -- imported rows must not be flagged as placeholders
    SELECT COUNT(*) FROM "Inventory" WHERE "isAutoGenerated" = true AND date < CURRENT_DATE - 7;
```

- [ ] **Step 4: Commit**

```bash
git add docs/HISTORICAL_IMPORT_RUNBOOK.md
git commit -m "docs: add historical import runbook"
```

---

## Task 9: Execute the import

- [ ] **Step 1: Back up**

Take a Supabase snapshot before clearing. This is the only undo.

- [ ] **Step 2: Clear and re-seed**

```bash
psql "$DATABASE_URL" -f prisma/truncate.sql
psql "$DATABASE_URL" -f prisma/seed-materials.sql
psql "$DATABASE_URL" -f prisma/seed-products.sql
psql "$DATABASE_URL" -f prisma/seed-product-aliases.sql
psql "$DATABASE_URL" -f prisma/seed-users.sql
```

Do **not** run `seed-local.sql` — it repopulates inventory with synthetic data that the import would then collide with.

- [ ] **Step 3: Backfill price history**

```bash
node scripts/backfill-price-history.mjs "D:/Downloads/louella-history"
```

- [ ] **Step 4: Import chronologically**

Follow `docs/HISTORICAL_IMPORT_RUNBOOK.md`, oldest file first, checking each response before proceeding.

- [ ] **Step 5: Close the autofill gap**

`POST /api/v1/jobs/autofill-range` from the day after the archive's last date through today.

- [ ] **Step 6: Verify**

Run the three verification queries from the runbook. Then open the dashboard and confirm revenue for a historical month is non-zero and uses period-appropriate prices (compare one product against its `ProductPriceHistory` row).

---

## Open questions for the client

1. **`Bonette` ₱30 vs ₱8** — two sizes, or a repricing that happened to appear twice? Determines whether Task 6 creates a second product.
2. **`Pandesal Pack` ₱40 vs ₱1000** — retail pack vs bulk sack? Confirm the ₱1000 name.
3. **`Peanut Butter L` / `Peanut Butter XL` / `8oz`** — real sellable products, or fixtures? If sellable, confirm names and current prices.
4. **Equipment rows** (`Estante`, `Freezer`, `Ref`, …) — confirm these should never enter inventory. Task 3 ignores them silently on that assumption.
5. **Template fix going forward** — will the client rename the ambiguous labels in the master template? That removes the need for price-hint aliases on all *future* files.
