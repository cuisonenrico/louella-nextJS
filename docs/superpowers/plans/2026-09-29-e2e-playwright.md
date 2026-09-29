# Playwright E2E Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the audit harness in `e2e/` with an isolated, asserting Playwright suite — a `@smoke` CI gate plus a fuller local suite — that can never touch the production database.

**Architecture:** Playwright starts a production build of the app on :4100 against a throwaway Docker Postgres (`louella_e2e` on :54329). A global setup guards the database URL, resets, migrates and seeds a minimal base. Each test builds its own isolated "world" (branch, manager, products, …) through the API, then drives the behaviour under test through the UI and cross-checks through the API.

**Tech Stack:** `@playwright/test` 1.62 (already installed), Docker `postgres:16`, Prisma 6, Next.js 16, NestJS 11 (`@nestjs/throttler` 6), Jest (server unit tests), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-29-e2e-playwright-design.md` — read it before starting. Section numbers below (§n) refer to it.

## Global Constraints

- Database for e2e: host `localhost` or `127.0.0.1`, database name `louella_e2e`, port `54329`. Anything else must abort before any reset, migrate or build.
- `.env.e2e` lists **every** key in `.env.example` and `.env.local` (blank where unused) so Next.js never fills one in from `.env`/`.env.local`.
- App under test: `http://localhost:4100`, production build (`next build` + `next start -p 4100`).
- Never run anything in this plan against `.env` — it is the production Supabase database.
- Production code may change only in: throttle limits (Task 1) and `data-testid` attributes (Tasks 6–10). Nothing else.
- Default throttle behaviour must be byte-for-byte unchanged when `E2E_RELAX_THROTTLE` is unset: global 20/60 s, login 5/60 s, refresh 60/60 s.
- Dates in tests come from `e2e/fixtures/dates.ts` (Manila). Never `new Date().getDate()` or similar.
- No `page.waitForTimeout`, no `console.log` in specs.
- Expected numbers are computed from the rule (sold = `quantity + delivery + Σadj − leftover − reject`; expected cash = `sales − expenses − vale`; pay = `rate × days worked + holiday pay + additions − deductions`), never hardcoded totals.
- Tags: `@smoke` = fast (< 20 s) and guards login, money or stock; `@stress` = safe to repeat in parallel. Payroll is never `@stress`.
- `tsconfig.json` includes `**/*.ts`, so every file under `e2e/` must pass `npx tsc --noEmit -p tsconfig.json`. Use the `@/…` path alias to import from `src/`.
- Windows: `npm run build` runs `prisma generate`, which fails with `EPERM … query_engine-windows.dll.node` while a dev server is running. Stop `npm run dev` before any step that builds.
- Commit after every task. End each commit message with:
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  ```
  (use the attribution line your harness gives you if it differs).

## Review Focus

1. **Env fall-through to production.** A key missing from `.env.e2e` silently takes the `.env.local` value (e.g. `SUPABASE_SERVICE_ROLE_KEY`). Pinned by `assertEnvComplete` in Task 2's unit test.
2. **Guard bypass by URL shape.** `DATABASE_URL` with query params (`?pgbouncer=true`), an uppercase host, `localhost.evil.com`, or a database named `louella_e2e_prod` must be refused. Pinned by Task 2's unit test cases.
3. **Relaxed throttle reaching a real deployment.** `E2E_RELAX_THROTTLE=1` with a Supabase `DATABASE_URL` must fail boot. Pinned by Task 1's env-validation test.
4. **Manila day boundary.** A run between 16:00 and 23:59 UTC is "tomorrow" in Manila. The server runs with `TZ` blank (UTC, like Vercel); tests compute "today" with `manilaToday()`. Pinned by Task 4's `dates.spec.ts` and by running `e2e:smoke` once with the host clock in that window (Task 13, step 3).
5. **Reruns against a live container.** Running the suite twice without restarting Docker must pass (global setup drops the schema). Pinned by Task 13, step 2.

---

### Task 1: Relaxable throttle limits, refused off-localhost

**Files:**
- Create: `src/server/common/config/throttle-limits.ts`
- Create: `src/server/common/config/throttle-limits.spec.ts`
- Modify: `src/server/common/config/env.validation.ts`
- Modify: `src/server/common/config/env.validation.spec.ts`
- Modify: `src/server/app.module.ts:50`
- Modify: `src/server/auth/auth.controller.ts:27,46`

**Interfaces:**
- Produces: `throttleLimit(defaultLimit: number, env?: NodeJS.ProcessEnv): number` — returns `defaultLimit` unless `env.E2E_RELAX_THROTTLE === '1'`, then `10_000`.
- Produces: `isLocalDatabaseUrl(url: string): boolean` (exported from `env.validation.ts`, reused by Task 2).

- [ ] **Step 1: Write the failing tests**

`src/server/common/config/throttle-limits.spec.ts`:

```ts
import { throttleLimit } from './throttle-limits';

describe('throttleLimit', () => {
  it('returns the default when the flag is unset', () => {
    expect(throttleLimit(20, {})).toBe(20);
    expect(throttleLimit(5, {})).toBe(5);
  });

  it('returns the default for any value other than "1"', () => {
    expect(throttleLimit(20, { E2E_RELAX_THROTTLE: 'true' })).toBe(20);
    expect(throttleLimit(20, { E2E_RELAX_THROTTLE: '' })).toBe(20);
  });

  it('relaxes to 10 000 when E2E_RELAX_THROTTLE=1', () => {
    expect(throttleLimit(20, { E2E_RELAX_THROTTLE: '1' })).toBe(10_000);
  });
});
```

Append to `src/server/common/config/env.validation.spec.ts` (keep existing tests; reuse its existing valid-config helper if one exists, otherwise use this `base`):

```ts
import { isLocalDatabaseUrl, validateEnv } from './env.validation';

describe('E2E_RELAX_THROTTLE guard', () => {
  const base = {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };

  it('accepts the flag with a localhost database', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'postgresql://u:p@localhost:54329/louella_e2e', E2E_RELAX_THROTTLE: '1' }),
    ).not.toThrow();
  });

  it('refuses the flag with a remote database', () => {
    expect(() =>
      validateEnv({
        ...base,
        DATABASE_URL: 'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
        E2E_RELAX_THROTTLE: '1',
      }),
    ).toThrow(/E2E_RELAX_THROTTLE/);
  });

  it('ignores a remote database when the flag is unset', () => {
    expect(() =>
      validateEnv({ ...base, DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres' }),
    ).not.toThrow();
  });
});

describe('isLocalDatabaseUrl', () => {
  it.each([
    ['postgresql://u:p@localhost:54329/louella_e2e', true],
    ['postgresql://u:p@127.0.0.1:54329/louella_e2e', true],
    ['postgresql://u:p@LOCALHOST:54329/louella_e2e', true],
    ['postgresql://u:p@localhost.evil.com:5432/x', false],
    ['postgresql://u:p@db.supabase.co:5432/postgres', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isLocalDatabaseUrl(url)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/server/common/config`
Expected: FAIL — `Cannot find module './throttle-limits'` and `isLocalDatabaseUrl is not a function`.

- [ ] **Step 3: Implement**

`src/server/common/config/throttle-limits.ts`:

```ts
/**
 * Rate limits, relaxable for the e2e suite only.
 *
 * Every e2e request comes from one IP, so the production limits (20/min
 * globally, 5/min on login) would 429 the suite within seconds. The flag is
 * refused at boot unless DATABASE_URL is local — see env.validation.ts — so it
 * cannot take effect on a real deployment.
 */
export const RELAXED_THROTTLE_LIMIT = 10_000;

export function throttleLimit(defaultLimit: number, env: NodeJS.ProcessEnv = process.env): number {
  return env.E2E_RELAX_THROTTLE === '1' ? RELAXED_THROTTLE_LIMIT : defaultLimit;
}
```

In `env.validation.ts`, add above `validateEnv`:

```ts
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** True only for a postgres URL whose host is exactly localhost or 127.0.0.1. */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
```

and inside `validateEnv`, just before `return config;`:

```ts
  // The e2e suite relaxes rate limits. That must never reach a real
  // deployment, so the flag is only accepted against a local database.
  if (config.E2E_RELAX_THROTTLE === '1' && !isLocalDatabaseUrl(String(config.DATABASE_URL))) {
    throw new Error(
      'E2E_RELAX_THROTTLE is set but DATABASE_URL is not a local database. ' +
        'The flag is for the e2e suite only.',
    );
  }
```

In `app.module.ts` line 50 replace

```ts
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
```
with
```ts
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: throttleLimit(20) }]),
```
and add `import { throttleLimit } from './common/config/throttle-limits';`.

In `auth.controller.ts` replace `limit: 5` with `limit: throttleLimit(5)` and `limit: 60` with `limit: throttleLimit(60)` in the two `@Throttle` decorators; add `import { throttleLimit } from '../common/config/throttle-limits';`. Leave the comments above them as they are.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/server/common/config`
Expected: PASS.
Run: `npm run test:server`
Expected: PASS (no other suite affected).

- [ ] **Step 5: Commit**

```bash
git add src/server/common/config src/server/app.module.ts src/server/auth/auth.controller.ts
git commit -m "feat(e2e): relaxable throttle limits, refused against a non-local database"
```

---

### Task 2: E2E environment, database container and safety guards

**Files:**
- Create: `docker-compose.e2e.yml`
- Create: `.env.e2e`
- Create: `e2e/support/env.ts`
- Create: `src/lib/e2e-env.spec.ts` (vitest only collects `src/**`; this spec imports from `e2e/support/env.ts`)
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `isLocalDatabaseUrl` is **not** imported here (keep `e2e/` independent of Nest code); the guard below is stricter (also checks db name).
- Produces (in `e2e/support/env.ts`):
  - `E2E_ENV_FILE = '.env.e2e'`
  - `loadE2eEnv(file?: string): Record<string, string>` — parses the dotenv file (no `process.env` merge).
  - `assertSafeDatabase(env: Record<string, string>): void` — throws unless both `DATABASE_URL` and `DIRECT_URL` have hostname `localhost`/`127.0.0.1` (case-insensitive, exact) and pathname `/louella_e2e` (exact).
  - `assertEnvComplete(env: Record<string, string>, templateKeys: string[]): void` — throws naming every template key missing from `env`.
  - `envExampleKeys(file?: string): string[]` — keys (commented-out lines excluded) of `.env.example`.

- [ ] **Step 1: Create the container and env file**

`docker-compose.e2e.yml`:

```yaml
# Throwaway Postgres for the Playwright suite. tmpfs: every container start is
# an empty database. Never point the e2e suite at .env — that is production.
services:
  db:
    image: postgres:16
    ports: ["54329:5432"]
    environment:
      POSTGRES_USER: louella
      POSTGRES_PASSWORD: louella
      POSTGRES_DB: louella_e2e
    tmpfs: ["/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U louella -d louella_e2e"]
      interval: 2s
      retries: 30
```

`.env.e2e` (committed; fake values only):

```
# E2E suite only. Every key from .env.example / .env.local is listed — blank
# where unused — so Next.js cannot fill one in from .env (production).
NODE_ENV=production
DATABASE_URL=postgresql://louella:louella@localhost:54329/louella_e2e
DIRECT_URL=postgresql://louella:louella@localhost:54329/louella_e2e
JWT_ACCESS_SECRET=e2e-access-secret-0123456789
JWT_REFRESH_SECRET=e2e-refresh-secret-0123456789
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
COOKIE_DOMAIN=
PRODUCTION_BRANCH_ID=1
CACHE_ENABLED=false
E2E_RELAX_THROTTLE=1
E2E_ADMIN_PASSWORD=E2e-Admin-Pass-1
E2E_MANAGER_PASSWORD=E2e-Manager-Pass-1
NEXT_TELEMETRY_DISABLED=1
TZ=
ALLOWED_ORIGINS=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=
FIREBASE_SERVICE_ACCOUNT=
VERCEL_OIDC_TOKEN=
NEXT_PUBLIC_API_URL=
```

Then list the keys of your real `.env.local` and `.env` **names only** (never print values):

Run: `grep -ho '^[A-Z_][A-Z0-9_]*=' .env .env.local | sort -u`

Add any key that is not already in `.env.e2e`, with a blank value.

- [ ] **Step 2: Write the failing guard tests**

`src/lib/e2e-env.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertEnvComplete, assertSafeDatabase } from '../../e2e/support/env';

const url = (host: string, db = 'louella_e2e', q = '') => `postgresql://u:p@${host}:54329/${db}${q}`;
const env = (d: string, direct = d) => ({ DATABASE_URL: d, DIRECT_URL: direct });

describe('assertSafeDatabase', () => {
  it.each([url('localhost'), url('127.0.0.1'), url('LOCALHOST')])('accepts %s', (u) => {
    expect(() => assertSafeDatabase(env(u))).not.toThrow();
  });

  it.each([
    ['remote host', url('db.abc.supabase.co')],
    ['lookalike host', url('localhost.evil.com')],
    ['wrong db', url('localhost', 'postgres')],
    ['db name prefix', url('localhost', 'louella_e2e_prod')],
    ['empty', ''],
  ])('refuses %s', (_label, u) => {
    expect(() => assertSafeDatabase(env(u))).toThrow(/louella_e2e/);
  });

  it('accepts query params on a safe url', () => {
    expect(() => assertSafeDatabase(env(url('localhost', 'louella_e2e', '?schema=public')))).not.toThrow();
  });

  it('refuses when only DIRECT_URL is remote', () => {
    expect(() => assertSafeDatabase(env(url('localhost'), url('db.abc.supabase.co')))).toThrow(/DIRECT_URL/);
  });
});

describe('assertEnvComplete', () => {
  it('names every missing key', () => {
    expect(() => assertEnvComplete({ A: '1' }, ['A', 'SUPABASE_SERVICE_ROLE_KEY', 'FIREBASE_SERVICE_ACCOUNT'])).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY.*FIREBASE_SERVICE_ACCOUNT/,
    );
  });

  it('treats a blank value as present', () => {
    expect(() => assertEnvComplete({ A: '' }, ['A'])).not.toThrow();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/e2e-env.spec.ts`
Expected: FAIL — cannot resolve `../../e2e/support/env`.

- [ ] **Step 4: Implement `e2e/support/env.ts`**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const E2E_ENV_FILE = '.env.e2e';
const SAFE_HOSTS = new Set(['localhost', '127.0.0.1']);
const SAFE_DB = '/louella_e2e';

/** Minimal dotenv parser: KEY=VALUE per line, # comments, no interpolation. */
function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function loadE2eEnv(file = E2E_ENV_FILE): Record<string, string> {
  return parse(readFileSync(resolve(process.cwd(), file), 'utf8'));
}

export function envExampleKeys(file = '.env.example'): string[] {
  return Object.keys(parse(readFileSync(resolve(process.cwd(), file), 'utf8')));
}

function isSafe(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return SAFE_HOSTS.has(u.hostname.toLowerCase()) && u.pathname === SAFE_DB;
  } catch {
    return false;
  }
}

/** Refuses to continue unless both URLs are the local louella_e2e database. */
export function assertSafeDatabase(env: Record<string, string>): void {
  for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    if (!isSafe(env[key])) {
      throw new Error(
        `[e2e] ${key} must point at localhost/127.0.0.1 database "louella_e2e". ` +
          'Refusing to run — .env is the production database.',
      );
    }
  }
}

/** Every template key must be present (blank counts), or Next.js fills it from .env. */
export function assertEnvComplete(env: Record<string, string>, templateKeys: string[]): void {
  const missing = templateKeys.filter((k) => !(k in env));
  if (missing.length) {
    throw new Error(`[e2e] ${E2E_ENV_FILE} is missing: ${missing.join(', ')}. Add them (blank if unused).`);
  }
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/e2e-env.spec.ts`
Expected: PASS.

- [ ] **Step 6: Add npm scripts**

In `package.json` `scripts`, add:

```json
"e2e:db": "docker compose -f docker-compose.e2e.yml up -d --wait",
"e2e:db:down": "docker compose -f docker-compose.e2e.yml down",
"e2e": "playwright test",
"e2e:smoke": "playwright test --project=desktop-chromium --grep @smoke",
"e2e:stress": "playwright test --project=desktop-chromium --grep @stress --repeat-each=10 --workers=4",
"e2e:ui": "playwright test --ui"
```

Run: `npm run e2e:db`
Expected: container `db` reports healthy.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.e2e.yml .env.e2e e2e/support/env.ts src/lib/e2e-env.spec.ts package.json
git commit -m "feat(e2e): throwaway Postgres, complete .env.e2e and database safety guards"
```

---

### Task 3: Global setup, base seed, config rewrite, old harness removed

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/seed/base.ts`
- Create: `e2e/support/credentials.ts`
- Rewrite: `playwright.config.ts`
- Delete: `e2e/01-route-sweep.spec.ts`, `e2e/03-refresh-throttle.spec.ts`, `e2e/04-states-responsive.spec.ts`, `e2e/05-error-timing.spec.ts`, `e2e/06-flows.spec.ts`, `e2e/08-verify-fixes.spec.ts`, `e2e/09-reload-probe.spec.ts`, `e2e/11-retry-count.spec.ts`, `e2e/12-session-migration.spec.ts`
- Create (temporary, removed in Task 5): `e2e/smoke/boot.spec.ts`

**Interfaces:**
- Consumes: `loadE2eEnv`, `assertSafeDatabase`, `assertEnvComplete`, `envExampleKeys` (Task 2).
- Produces (in `e2e/support/credentials.ts`):
  ```ts
  export const KITCHEN_BRANCH_ID = 1;
  export const ADMIN   = { email: 'e2e-admin@louella.test',   password: env.E2E_ADMIN_PASSWORD };
  export const MANAGER = { email: 'e2e-manager@louella.test', password: env.E2E_MANAGER_PASSWORD };
  export const VIEWER  = { email: 'e2e-viewer@louella.test',  password: env.E2E_MANAGER_PASSWORD };
  export const STATE = { admin: 'e2e/.auth/admin.json', manager: 'e2e/.auth/manager.json' };
  ```
- Produces: base seed rows — branch id 1 `E2E Kitchen`; users above; one `JobRole` named `E2E Baker`; one `ExpenseCategory` named `E2E Supplies`.

- [ ] **Step 1: Delete the old harness**

```bash
git rm e2e/01-route-sweep.spec.ts e2e/03-refresh-throttle.spec.ts e2e/04-states-responsive.spec.ts \
  e2e/05-error-timing.spec.ts e2e/06-flows.spec.ts e2e/08-verify-fixes.spec.ts \
  e2e/09-reload-probe.spec.ts e2e/11-retry-count.spec.ts e2e/12-session-migration.spec.ts
```

(`auth.setup.ts` and `routes.ts` are rewritten in Task 5; leave them for now but they will not run — Step 4's config only matches `auth.setup.ts` in the `setup` project, which Task 5 rewrites. Until then the setup project is removed from the config; see Step 4.)

- [ ] **Step 2: Write `e2e/support/credentials.ts`**

```ts
import { loadE2eEnv } from './env';

const env = loadE2eEnv();

export const KITCHEN_BRANCH_ID = 1;
export const ADMIN = { email: 'e2e-admin@louella.test', password: env.E2E_ADMIN_PASSWORD };
export const MANAGER = { email: 'e2e-manager@louella.test', password: env.E2E_MANAGER_PASSWORD };
export const VIEWER = { email: 'e2e-viewer@louella.test', password: env.E2E_MANAGER_PASSWORD };
export const STATE = { admin: 'e2e/.auth/admin.json', manager: 'e2e/.auth/manager.json' };
```

- [ ] **Step 3: Write `e2e/seed/base.ts`**

Read `prisma/schema.prisma` models `Branch`, `User`, `JobRole`, `ExpenseCategory` first and match required fields exactly; the shape below assumes `User { email, passwordHash, role, branchId, isActive }` — if a field name differs, use the schema's.

```ts
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

  const users: Array<[typeof ADMIN, UserRole, number | null]> = [
    [ADMIN, UserRole.ADMIN, null],
    [MANAGER, UserRole.MANAGER, KITCHEN_BRANCH_ID],
    [VIEWER, UserRole.VIEWER, KITCHEN_BRANCH_ID],
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
```

- [ ] **Step 4: Write `e2e/global-setup.ts`**

```ts
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertEnvComplete, assertSafeDatabase, envExampleKeys, loadE2eEnv } from './support/env';
import { seedBase } from './seed/base';

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
}
```

- [ ] **Step 5: Rewrite `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';
import { assertSafeDatabase, loadE2eEnv } from './e2e/support/env';

/**
 * E2E suite. Runs a production build on :4100 against the throwaway
 * louella_e2e database (docker-compose.e2e.yml). Never against .env.
 * Start the database first: npm run e2e:db
 */
const env = loadE2eEnv();
assertSafeDatabase(env);
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: CI ? 2 : 4,
  retries: CI ? 1 : 0,
  reporter: CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  outputDir: 'e2e-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Manila',
  },
  webServer: {
    command: 'npm run build && npx next start -p 4100',
    url: 'http://localhost:4100/login',
    env: { ...(process.env as Record<string, string>), ...env },
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

(Task 5 adds the `setup` and `tablet-webkit` projects.)

- [ ] **Step 6: Temporary boot check**

`e2e/smoke/boot.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('app boots against the e2e database @smoke', async ({ page, request }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  const res = await request.post('/api/v1/auth/login', {
    data: { email: 'e2e-admin@louella.test', password: 'E2e-Admin-Pass-1' },
  });
  expect(res.status()).toBe(201);
});
```

- [ ] **Step 7: Run it**

Stop `npm run dev` if running. Ensure `npm run e2e:db` is up.
Run: `npx playwright test e2e/smoke/boot.spec.ts`
Expected: build output, then `1 passed`.

If login returns 200 instead of 201, change the assertion to `expect(res.ok()).toBe(true)`.

- [ ] **Step 8: Verify the guard aborts**

Temporarily change `.env.e2e`'s `DATABASE_URL` host to `db.example.com`.
Run: `npx playwright test e2e/smoke/boot.spec.ts`
Expected: fails immediately with `[e2e] DATABASE_URL must point at localhost…` and **no** build output. Revert the change.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

```bash
git add -A e2e playwright.config.ts
git commit -m "feat(e2e): guarded global setup, base seed, production-build config; drop audit harness"
```

---

### Task 4: API client, dates and the world fixture

**Files:**
- Create: `e2e/fixtures/api.ts`
- Create: `e2e/fixtures/dates.ts`
- Create: `e2e/fixtures/world.ts`
- Create: `e2e/fixtures/test.ts`
- Create: `src/lib/e2e-dates.spec.ts`
- Create: `e2e/full/world.spec.ts`

**Interfaces:**
- Consumes: `ADMIN`, `KITCHEN_BRANCH_ID`, `MANAGER` (Task 3).
- Produces (`e2e/fixtures/dates.ts`):
  ```ts
  export { manilaToday, addDays } from '@/lib/manilaDate';
  export function today(): string;             // manilaToday()
  export function yesterday(): string;         // addDays(today(), -1)
  export function previousCutoff(): Cutoff;    // cutoff containing addDays(currentCutoff().periodStart, -1)
  export function workingDays(c: Cutoff, restDays: number[]): string[]; // eachDate(...) filtered by weekdayOf
  ```
- Produces (`e2e/fixtures/api.ts`):
  ```ts
  export class Api {
    static async login(request: APIRequestContext, creds: { email: string; password: string }): Promise<Api>;
    get<T>(path: string, params?: Record<string, string | number>): Promise<T>;
    post<T>(path: string, data?: unknown): Promise<T>;
    patch<T>(path: string, data?: unknown): Promise<T>;
    put<T>(path: string, data?: unknown): Promise<T>;
    /** Returns the raw response without throwing — for asserting refusals. */
    raw(method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE', path: string, data?: unknown): Promise<APIResponse>;
  }
  ```
  Paths are relative to `/api/v1` (e.g. `api.post('/branches', …)`). Non-2xx throws `Error("<METHOD> <path> → <status>: <body>")`.
- Produces (`e2e/fixtures/world.ts`):
  ```ts
  export interface WorldOptions {
    products?: number;            // default 2
    withRecipe?: boolean;         // default false — material + recipe for products[0]
    employees?: number;           // default 0
    hireDate?: string;            // default today()
    dailyRate?: number;           // default 600
    restDays?: number[];          // default [0] (Sunday)
    recurringDeduction?: number;  // default none
  }
  export interface World {
    id: string;                                   // short unique tag, e.g. "7f3a9c"
    branch: { id: number; name: string };
    manager: { id: number; email: string; password: string };
    products: Array<{ id: number; name: string; price: number }>;
    material?: { id: number; name: string; unit: 'G' };
    recipe?: { id: number; gramsPerUnit: number };   // grams of material per 1 product unit
    employees: Array<{ id: number; firstName: string; lastName: string; dailyRate: number; restDays: number[] }>;
  }
  export async function buildWorld(api: Api, opts?: WorldOptions): Promise<World>;
  export async function managerPage(browser: Browser, world: World): Promise<Page>;
  ```
- Produces (`e2e/fixtures/test.ts`): `test` extended with fixtures `api: Api` (admin, worker-scoped), `world: World` (built with default options; tests needing options call `buildWorld` themselves), and re-export of `expect`.

- [ ] **Step 1: Failing test for dates**

`src/lib/e2e-dates.spec.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { previousCutoff, today, workingDays, yesterday } from '../../e2e/fixtures/dates';

afterEach(() => vi.useRealTimers());

describe('e2e dates', () => {
  it('uses the Manila day, not UTC, after 16:00 UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T16:30:00Z'));
    expect(today()).toBe('2026-09-19');
    expect(yesterday()).toBe('2026-09-18');
  });

  it('previous cutoff of a 16–end day is 1–15 of the same month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T02:00:00Z'));
    expect(previousCutoff()).toMatchObject({ periodStart: '2026-09-01', periodEnd: '2026-09-15', half: 1 });
  });

  it('previous cutoff of a 1–15 day is 16–end of the previous month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T02:00:00Z'));
    expect(previousCutoff()).toMatchObject({ periodStart: '2026-09-16', periodEnd: '2026-09-30', half: 2 });
  });

  it('workingDays drops rest days', () => {
    const days = workingDays({ periodStart: '2026-09-01', periodEnd: '2026-09-07', half: 1 }, [0]);
    expect(days).not.toContain('2026-09-06'); // Sunday
    expect(days).toHaveLength(6);
  });
});
```

Run: `npx vitest run src/lib/e2e-dates.spec.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `e2e/fixtures/dates.ts`**

```ts
import { addDays, manilaToday } from '@/lib/manilaDate';
import { currentCutoff, cutoffOf, eachDate, weekdayOf, type Cutoff } from '@/lib/payroll/cutoff';

export { addDays, manilaToday };
export type { Cutoff };

export const today = (): string => manilaToday();
export const yesterday = (): string => addDays(today(), -1);

export function previousCutoff(): Cutoff {
  return cutoffOf(addDays(currentCutoff().periodStart, -1));
}

export function workingDays(c: Cutoff, restDays: number[]): string[] {
  return eachDate(c.periodStart, c.periodEnd).filter((d) => !restDays.includes(weekdayOf(d)));
}
```

Check `weekdayOf` in `src/lib/payroll/cutoff.ts` returns 0 = Sunday (matches `restDays` in `CreateEmployeeDto`, 0–6). If it does not, adjust the test and use the same convention as `restDays`.

Run: `npx vitest run src/lib/e2e-dates.spec.ts` → PASS.

- [ ] **Step 3: Implement `e2e/fixtures/api.ts`**

```ts
import type { APIRequestContext, APIResponse } from '@playwright/test';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const BASE = '/api/v1';

/** Setup and cross-checks only — never the action under test. */
export class Api {
  private constructor(
    private readonly request: APIRequestContext,
    private readonly creds: { email: string; password: string },
    private token: string,
  ) {}

  static async login(request: APIRequestContext, creds: { email: string; password: string }): Promise<Api> {
    return new Api(request, creds, await Api.fetchToken(request, creds));
  }

  private static async fetchToken(request: APIRequestContext, creds: { email: string; password: string }) {
    const res = await request.post(`${BASE}/auth/login`, { data: creds });
    if (!res.ok()) throw new Error(`login ${creds.email} → ${res.status()}: ${await res.text()}`);
    return ((await res.json()) as { accessToken: string }).accessToken;
  }

  async raw(method: Method, path: string, data?: unknown, params?: Record<string, string | number>): Promise<APIResponse> {
    const send = () =>
      this.request.fetch(`${BASE}${path}`, {
        method,
        data,
        params,
        headers: { Authorization: `Bearer ${this.token}` },
      });
    let res = await send();
    if (res.status() === 401) {
      this.token = await Api.fetchToken(this.request, this.creds);
      res = await send();
    }
    return res;
  }

  private async json<T>(method: Method, path: string, data?: unknown, params?: Record<string, string | number>): Promise<T> {
    const res = await this.raw(method, path, data, params);
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string, params?: Record<string, string | number>) { return this.json<T>('GET', path, undefined, params); }
  post<T>(path: string, data?: unknown) { return this.json<T>('POST', path, data); }
  patch<T>(path: string, data?: unknown) { return this.json<T>('PATCH', path, data); }
  put<T>(path: string, data?: unknown) { return this.json<T>('PUT', path, data); }
}
```

If responses are wrapped (e.g. `{ data: … }`) by a global interceptor, unwrap in `json()` once — check one response in Step 7 and adjust here only.

- [ ] **Step 4: Implement `e2e/fixtures/world.ts`**

```ts
import { randomBytes } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import { Api } from './api';
import { addDays, today } from './dates';
import { loadE2eEnv } from '../support/env';

// (WorldOptions and World interfaces exactly as in this task's Interfaces block)

const PASSWORD = loadE2eEnv().E2E_MANAGER_PASSWORD;

export async function buildWorld(api: Api, opts: WorldOptions = {}): Promise<World> {
  const id = randomBytes(3).toString('hex');
  const tag = (s: string) => `E2E-${id} ${s}`;

  const branch = await api.post<{ id: number; name: string }>('/branches', { name: tag('Branch'), isActive: true });

  const email = `e2e-${id}@louella.test`;
  const manager = await api.post<{ id: number }>('/users', {
    email, password: PASSWORD, role: 'MANAGER', branchId: branch.id, mustChangePassword: false,
  });

  // Launch date before yesterday so the product has a price on every day tests touch.
  const launched = addDays(today(), -30);
  const products: World['products'] = [];
  for (let i = 0; i < (opts.products ?? 2); i++) {
    const price = 10 + i * 5;
    const p = await api.post<{ id: number; name: string }>('/products', {
      name: tag(`Bread ${i + 1}`), type: 'BREAD', price, date: launched, isActive: true,
    });
    products.push({ id: p.id, name: p.name, price });
  }

  let material: World['material'];
  let recipe: World['recipe'];
  if (opts.withRecipe) {
    const m = await api.post<{ id: number; name: string }>('/materials', { name: tag('Flour'), unit: 'G', pricePerUnit: 0.05 });
    material = { id: m.id, name: m.name, unit: 'G' };
    const gramsPerUnit = 50;
    const r = await api.post<{ id: number }>('/recipes', {
      productId: products[0].id, recipeYield: 1,
      items: [{ materialId: m.id, quantity: gramsPerUnit, unit: 'G' }],
    });
    recipe = { id: r.id, gramsPerUnit };
  }

  const employees: World['employees'] = [];
  if (opts.employees) {
    const roles = await api.get<Array<{ id: number; name: string }>>('/job-roles');
    const jobRoleId = roles.find((r) => r.name === 'E2E Baker')!.id;
    for (let i = 0; i < opts.employees; i++) {
      const dailyRate = opts.dailyRate ?? 600;
      const restDays = opts.restDays ?? [0];
      const e = await api.post<{ id: number; firstName: string; lastName: string }>('/employees', {
        firstName: `E2E${id}`, lastName: `Worker${i + 1}`, jobRoleId, branchId: branch.id,
        restDays, hiredOn: opts.hireDate ?? today(), dailyRate,
      });
      if (opts.recurringDeduction) {
        await api.post(`/employees/${e.id}/recurring-deductions`, { name: 'SSS', employeeShare: opts.recurringDeduction });
      }
      employees.push({ id: e.id, firstName: e.firstName, lastName: e.lastName, dailyRate, restDays });
    }
  }

  return { id, branch, manager: { id: manager.id, email, password: PASSWORD }, products, material, recipe, employees };
}

/** A browser page signed in as the world's manager, via the API cookie flow (no UI). */
export async function managerPage(browser: Browser, world: World): Promise<Page> {
  const context = await browser.newContext();
  const res = await context.request.post('/api/v1/auth/login', {
    data: { email: world.manager.email, password: world.manager.password },
  });
  if (!res.ok()) throw new Error(`manager login → ${res.status()}`);
  // The response set refresh_token (HttpOnly) + has_session on this context;
  // AuthContext re-mints the access token on first page load.
  return context.newPage();
}
```

Before running, check these against the code and fix field names in `world.ts` only:
- `POST /branches` returns the created branch with `id` (`branches.service.ts`).
- `POST /products` with `date` + `price` records a `ProductPriceHistory` row effective on `date` (`products.service.ts`). If it records today instead, also `PATCH /products/:id` is not a fix — instead insert nothing and use `launched = today()`; adjust §6.2 tests to use today rather than yesterday for price-sensitive assertions, and note it in the task report.
- `POST /users` field names (`CreateUserDto`: `email, password, role, branchId, mustChangePassword`).
- `GET /job-roles` returns an array (not paged).
- The `new URL` base for `context.request` is the config `baseURL` — correct since `browser.newContext()` inherits `use.baseURL`.

- [ ] **Step 5: Implement `e2e/fixtures/test.ts`**

```ts
import { test as base, expect } from '@playwright/test';
import { Api } from './api';
import { buildWorld, type World } from './world';
import { ADMIN } from '../support/credentials';

type TestFixtures = { world: World };
type WorkerFixtures = { api: Api };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  api: [
    async ({ playwright }, use) => {
      const request = await playwright.request.newContext({ baseURL: 'http://localhost:4100' });
      await use(await Api.login(request, ADMIN));
      await request.dispose();
    },
    { scope: 'worker' },
  ],
  world: async ({ api }, use) => {
    await use(await buildWorld(api));
  },
});

export { expect };
```

- [ ] **Step 6: Fixture self-test**

`e2e/full/world.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';

test('world builds an isolated branch with a working manager', async ({ api, browser }) => {
  const world = await buildWorld(api, { products: 2, withRecipe: true, employees: 1 });
  expect(world.products).toHaveLength(2);
  expect(world.recipe?.gramsPerUnit).toBe(50);
  expect(world.employees[0].dailyRate).toBe(600);

  const page = await managerPage(browser, world);
  await page.goto('/dashboard');
  await expect(page).not.toHaveURL(/\/login/);
  await page.context().close();
});

test('two worlds never share a branch', async ({ api }) => {
  const [a, b] = await Promise.all([buildWorld(api), buildWorld(api)]);
  expect(a.branch.id).not.toBe(b.branch.id);
  expect(a.id).not.toBe(b.id);
});
```

- [ ] **Step 7: Run**

Run: `npx playwright test e2e/full/world.spec.ts`
Expected: `2 passed`. On a 4xx, the thrown message names the endpoint and body — fix the field name in `world.ts` and rerun.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/lib/e2e-dates.spec.ts`

```bash
git add e2e/fixtures e2e/full/world.spec.ts src/lib/e2e-dates.spec.ts
git commit -m "feat(e2e): API client, Manila date helpers and isolated world fixture"
```

---

### Task 5: Auth — setup project, login page object, smoke + full specs, routes

**Files:**
- Rewrite: `e2e/auth.setup.ts`
- Rewrite: `e2e/routes.ts`
- Create: `e2e/pages/login.page.ts`
- Create: `e2e/smoke/auth.spec.ts`
- Create: `e2e/full/auth.spec.ts`
- Delete: `e2e/smoke/boot.spec.ts`
- Modify: `playwright.config.ts` (projects)

**Interfaces:**
- Consumes: `ADMIN`, `MANAGER`, `VIEWER`, `STATE` (Task 3); `test`, `expect`, `buildWorld`, `managerPage` (Task 4).
- Produces (`e2e/pages/login.page.ts`):
  ```ts
  export class LoginPage {
    constructor(page: Page);
    goto(): Promise<void>;
    login(email: string, password: string): Promise<void>;
    readonly error: Locator;   // visible error message after a failed login
  }
  ```
- Produces (`e2e/routes.ts`): `STATIC_ROUTES: string[]` (every non-dynamic route in spec §8.1 except `/`, `/login`, `/register`), `PUBLIC_ROUTES = ['/', '/login', '/register']`, `dynamicRoutes(ctx: { employeeId: number; periodStart: string }): string[]` returning `/employees/<id>` and `/payroll/<periodStart>`.
- Produces: storage states `e2e/.auth/admin.json`, `e2e/.auth/manager.json`.

- [ ] **Step 1: Page object**

Read `src/app/login/page.tsx` for the exact labels, button text and how the error is rendered (inline text vs `sonner` toast). Then write:

```ts
import type { Locator, Page } from '@playwright/test';

export class LoginPage {
  readonly error: Locator;

  constructor(private readonly page: Page) {
    // Replace with the exact error element found in src/app/login/page.tsx
    // (e.g. role="alert", or the sonner toast: page.locator('[data-sonner-toast]')).
    this.error = page.getByRole('alert');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.locator('input[type="email"]').fill(email);
    await this.page.locator('input[type="password"]').fill(password);
    await this.page.getByRole('button', { name: /sign in|log ?in/i }).click();
  }
}
```

If the email/password inputs have associated `<Label htmlFor>`, prefer `page.getByLabel(/email/i)` and `page.getByLabel(/password/i)`.

- [ ] **Step 2: Setup project**

`e2e/auth.setup.ts`:

```ts
import { expect, test as setup } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { ADMIN, MANAGER, STATE } from './support/credentials';

for (const [name, creds, file] of [['admin', ADMIN, STATE.admin], ['manager', MANAGER, STATE.manager]] as const) {
  setup(`authenticate as ${name}`, async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(creds.email, creds.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.context().storageState({ path: file });
  });
}
```

`playwright.config.ts` `projects` becomes:

```ts
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
    },
    {
      name: 'tablet-webkit',
      use: { ...devices['iPad (gen 7) landscape'], storageState: 'e2e/.auth/admin.json' },
      dependencies: ['setup'],
    },
  ],
```

Run `npx playwright test --list | head` — if `iPad (gen 7) landscape` is not a known device, use the newest `iPad … landscape` key from `node_modules/playwright-core/lib/server/deviceDescriptorsSource.json`.

- [ ] **Step 3: Routes**

`e2e/routes.ts`:

```ts
/** Every route in src/app/**/page.tsx. Keep in sync with spec §8.1 — the adding-e2e-coverage skill enforces it. */
export const PUBLIC_ROUTES = ['/', '/login', '/register'];

export const STATIC_ROUTES = [
  '/dashboard', '/sales',
  '/inventory', '/inventory/details', '/inventory/gaps', '/inventory/rejections',
  '/inventory-adjustments', '/inventory-import', '/inventory-import/history',
  '/production', '/production/orders', '/production-orders', '/production-cost', '/production-efficiency',
  '/material-inventory', '/material-inventory/gaps', '/materials',
  '/products', '/recipes', '/branches', '/suppliers', '/unit-conversions', '/config/product-order',
  '/employees', '/payroll', '/branch-cash',
  '/settings/users', '/settings/permissions', '/settings/jobs', '/settings/payroll', '/settings/landing',
  '/no-access', '/change-password',
];

export function dynamicRoutes(ctx: { employeeId: number; periodStart: string }): string[] {
  return [`/employees/${ctx.employeeId}`, `/payroll/${ctx.periodStart}`];
}
```

Cross-check: `find src/app -name page.tsx` — every route must appear in one of the three lists except `/payroll/payslips/[id]` and `/payroll/runs/[id]/print` (need a finalized run; covered by the payroll spec).

- [ ] **Step 4: Smoke spec**

`e2e/smoke/auth.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/login.page';
import { ADMIN } from '../support/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('auth @smoke', () => {
  test('admin logs in and lands off /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, ADMIN.password);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('wrong password shows an error and stays on /login', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, 'Wrong-Password-1');
    await expect(login.error).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('reload keeps the session via the refresh cookie', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(ADMIN.email, ADMIN.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/dashboard');
    const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/refresh'));
    await page.reload();
    expect((await refreshed).ok()).toBe(true);
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
```

- [ ] **Step 5: Full spec**

`e2e/full/auth.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';
import { LoginPage } from '../pages/login.page';
import { VIEWER } from '../support/credentials';
import { loadE2eEnv } from '../support/env';

test.describe('auth', () => {
  test('logout returns to /login and protects /dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // Find the logout control in src/components/layout (user menu). Replace the locator if needed.
    await page.getByRole('button', { name: /account|user|profile/i }).click();
    await page.getByRole('menuitem', { name: /log ?out|sign ?out/i }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a manager sees only their own branch', async ({ api, browser }) => {
    const mine = await buildWorld(api);
    const other = await buildWorld(api);
    const page = await managerPage(browser, mine);
    await page.goto('/inventory/details');
    await expect(page.getByText(mine.branch.name)).toBeVisible();
    await expect(page.getByText(other.branch.name)).toHaveCount(0);

    // The API scopes too: the manager asking for the other branch gets none of its rows.
    // (managerPage has no bearer token for page.request — log in to get one.)
    const login = await page.request.post('/api/v1/auth/login', {
      data: { email: mine.manager.email, password: mine.manager.password },
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await page.request.get(`/api/v1/sales/branch/${other.branch.id}/date`, {
      params: { date: today() },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // BranchGuard either refuses (403) or rewrites to the manager's own branch.
    if (res.ok()) {
      const body = (await res.json()) as { breakdown: Array<{ product: { id: number } }> };
      expect(body.breakdown.map((r) => r.product.id)).not.toContain(other.products[0].id);
    } else {
      expect(res.status()).toBe(403);
    }
    await page.context().close();
  });

  test('a viewer is sent to /no-access on an admin page', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const login = new LoginPage(page);
    await login.goto();
    await login.login(VIEWER.email, VIEWER.password);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/settings/users');
    await expect(page).toHaveURL(/\/no-access/);
    await context.close();
  });

  test('change password: new works, old is refused', async ({ api, browser }) => {
    const world = await buildWorld(api);
    const page = await managerPage(browser, world);
    const next = 'E2e-Changed-Pass-2';
    await page.goto('/change-password');
    await page.getByLabel(/current password/i).fill(world.manager.password);
    await page.getByLabel(/^new password/i).fill(next);
    const confirm = page.getByLabel(/confirm/i);
    if (await confirm.count()) await confirm.fill(next);
    await page.getByRole('button', { name: /change|update|save/i }).click();
    await expect(page).not.toHaveURL(/\/change-password$/);

    const old = await page.request.post('/api/v1/auth/login', { data: { email: world.manager.email, password: loadE2eEnv().E2E_MANAGER_PASSWORD } });
    expect(old.status()).toBe(401);
    const fresh = await page.request.post('/api/v1/auth/login', { data: { email: world.manager.email, password: next } });
    expect(fresh.ok()).toBe(true);
    await page.context().close();
  });
});
```

Add `import { today } from '../fixtures/dates';` to this file. The logout locator is a guess: find the real control in `src/components/layout/` and use its role and name.

- [ ] **Step 6: Run**

`git rm e2e/smoke/boot.spec.ts`
Run: `npx playwright test e2e/smoke/auth.spec.ts e2e/full/auth.spec.ts --project=desktop-chromium`
Expected: all pass. Fix locators by reading the components, not by adding waits.

- [ ] **Step 7: Commit**

```bash
git add -A e2e playwright.config.ts
git commit -m "test(e2e): auth smoke and full specs, storage states, full route list"
```

---

### Task 6: Route sweep

**Files:**
- Create: `e2e/smoke/route-sweep.spec.ts`

**Interfaces:**
- Consumes: `STATIC_ROUTES`, `PUBLIC_ROUTES`, `dynamicRoutes` (Task 5); `buildWorld`, `previousCutoff` (Task 4).

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld } from '../fixtures/world';
import { previousCutoff } from '../fixtures/dates';
import { dynamicRoutes, PUBLIC_ROUTES, STATIC_ROUTES } from '../routes';

test.describe('route sweep @smoke', () => {
  test('every route renders without an error or a 5xx', async ({ api, page }) => {
    test.setTimeout(180_000);
    const world = await buildWorld(api, { employees: 1 });
    const routes = [
      ...PUBLIC_ROUTES,
      ...STATIC_ROUTES,
      ...dynamicRoutes({ employeeId: world.employees[0].id, periodStart: previousCutoff().periodStart }),
    ];

    const failures: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/v1/') && r.status() >= 500) failures.push(`${r.status()} ${r.url()}`);
    });

    for (const route of routes) {
      await test.step(route, async () => {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await expect(page.getByText(/application error|something went wrong|unhandled runtime error/i)).toHaveCount(0);
        await expect(page.locator('main, [role="main"]').first()).toBeVisible();
      });
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
```

Check the app's error boundary text (`src/app/**/error.tsx`, `global-error.tsx`) and add its exact heading to the regex.

- [ ] **Step 2: Run**

Run: `npx playwright test e2e/smoke/route-sweep.spec.ts --project=desktop-chromium`
Expected: pass. A failure names the route in the step. A genuine app bug found here is **not** fixed in this plan: mark that route `test.fixme` inside the loop with a comment naming the error, and list it in the task report.

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/route-sweep.spec.ts
git commit -m "test(e2e): route sweep over every page"
```

---

### Task 7: Inventory sheet

**Files:**
- Create: `e2e/pages/inventory-sheet.page.ts`
- Create: `e2e/smoke/inventory-sheet.spec.ts`
- Create: `e2e/full/inventory-sheet.spec.ts`
- Modify (only if needed): components rendering the sheet grid under `src/components/sheet/` or `src/app/(app)/inventory/details/` — add `data-testid` only.

**Interfaces:**
- Consumes: `buildWorld`, `managerPage`, `today`, `yesterday`, `Api`.
- Produces (`e2e/pages/inventory-sheet.page.ts`):
  ```ts
  export type SheetField = 'quantity' | 'delivery' | 'leftover' | 'reject';
  export class InventorySheet {
    constructor(page: Page);
    open(branchName: string, date: string): Promise<void>;          // selects branch + date on /inventory/details
    setCell(productName: string, field: SheetField, value: number): Promise<void>; // edits and waits for the save response
    cell(productName: string, field: SheetField | 'sold' | 'opening'): Locator;
    isUncounted(productName: string): Locator;                      // the "uncounted" marker for that row
  }
  ```

- [ ] **Step 1: Discover the sheet's structure**

Read `src/app/(app)/inventory/details/page.tsx` and the shared sheet module (`src/components/sheet`, `src/lib/sheet`). Answer, and write the answers as a comment at the top of `inventory-sheet.page.ts`:
1. How are branch and date chosen (select, date input, URL query params)? If URL params are supported, `open()` uses them.
2. How is a product row identified (row header text)? How is a column identified (header text)? Is the grid a `role="grid"`/`table`?
3. Which request saves an edit (`PATCH /inventory/bulk`?) and when (blur, Enter, debounce)?
4. How is "opening" labelled (probably the `quantity` column) and how is an uncounted leftover shown?
5. Does a brand-new branch get a row for **yesterday** when yesterday is opened? (Autofill tops up today and catches up at most 7 days — see `src/server/jobs/autofill-on-demand.service.ts`.) If no row appears, create yesterday's rows in the test as **setup** with `api.post('/inventory', { branchId, productId, date: yesterday(), quantity: 0 })` before opening the sheet, and say so in a comment.

Run the app (`npx playwright test --ui` with a one-line spec, or `npx playwright codegen http://localhost:4100/inventory/details` while the e2e server is up) to confirm.

If cells have no accessible name, add `data-testid={`cell-${productId}-${field}`}` in the cell renderer (one line) and `data-testid={`uncounted-${productId}`}` on the marker. That is the only production edit allowed.

- [ ] **Step 2: Implement the page object**

Implement against what Step 1 found. `setCell` must wait for the save, e.g.:

```ts
async setCell(productName: string, field: SheetField, value: number) {
  const input = this.cell(productName, field);
  await input.click();
  await input.fill(String(value));
  const saved = this.page.waitForResponse((r) => r.url().includes('/api/v1/inventory') && r.request().method() !== 'GET' && r.ok());
  await input.press('Enter');
  await saved;
}
```

- [ ] **Step 3: Smoke spec**

`e2e/smoke/inventory-sheet.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';
import { today, yesterday } from '../fixtures/dates';
import { InventorySheet } from '../pages/inventory-sheet.page';

test.describe('inventory sheet @smoke @stress', () => {
  test('sold is derived and today opens at yesterday\'s close', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const product = world.products[0];
    const page = await managerPage(browser, world);
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, yesterday());
    const quantity = Number(await sheet.cell(product.name, 'quantity').inputValue().catch(() => sheet.cell(product.name, 'quantity').innerText()));
    const delivery = 40, reject = 3, leftover = 7;
    await sheet.setCell(product.name, 'delivery', delivery);
    await sheet.setCell(product.name, 'reject', reject);
    await sheet.setCell(product.name, 'leftover', leftover);

    // sold = quantity + delivery + Σadj − leftover − reject (no adjustments here)
    await expect(sheet.cell(product.name, 'sold')).toHaveText(String(quantity + delivery - leftover - reject));

    await sheet.open(world.branch.name, today());
    // Close = leftover when counted; opening (quantity) today must equal it.
    await expect(sheet.cell(product.name, 'opening')).toHaveText(String(leftover));
    await page.context().close();
  });
});
```

If `quantity`/`opening` cells are inputs, use `toHaveValue` instead of `toHaveText` — decide once from Step 1 and make the page object's `cell()` return the element whose text or value holds the number; add a `readNumber(productName, field): Promise<number>` helper to the page object if both kinds exist, and use it here instead of the inline `inputValue().catch(...)`.

- [ ] **Step 4: Full spec**

`e2e/full/inventory-sheet.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';
import { today, yesterday } from '../fixtures/dates';
import { InventorySheet } from '../pages/inventory-sheet.page';

test.describe('inventory sheet @stress', () => {
  test('editing yesterday\'s leftover carries into today\'s opening', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const page = await managerPage(browser, world);
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, yesterday());
    await sheet.setCell(p.name, 'delivery', 30);
    await sheet.setCell(p.name, 'leftover', 5);
    await sheet.open(world.branch.name, today());
    await expect(sheet.cell(p.name, 'opening')).toHaveText('5');

    await sheet.open(world.branch.name, yesterday());
    await sheet.setCell(p.name, 'leftover', 9);
    await sheet.open(world.branch.name, today());
    await expect(sheet.cell(p.name, 'opening')).toHaveText('9');
    await page.context().close();
  });

  test('an uncounted row is flagged and sells nothing', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const page = await managerPage(browser, world);
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today());
    await sheet.setCell(p.name, 'delivery', 20);
    await expect(sheet.isUncounted(p.name)).toBeVisible();

    // GET /sales/branch/:id/date → { breakdown: [{ product: { id }, sold, sales, settled, … }], totals }
    const sales = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
    const row = sales.breakdown.find((r) => r.product.id === p.id)!;
    expect(row.settled).toBe(false);
    expect(row.sold).toBe(0);
    await page.context().close();
  });

  test('opening a day with no rows autofills them', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 2 });
    const page = await managerPage(browser, world);
    const sheet = new InventorySheet(page);
    await sheet.open(world.branch.name, today());
    for (const p of world.products) {
      await expect(sheet.cell(p.name, 'opening')).toBeVisible();
    }
    const sales = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date: today() });
    expect(sales.breakdown.map((r) => r.product.id).sort()).toEqual(world.products.map((p) => p.id).sort());
    await page.context().close();
  });

  test('a PULL_IN adjustment moves sold', async ({ api, browser }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const page = await managerPage(browser, world);
    const sheet = new InventorySheet(page);

    await sheet.open(world.branch.name, today());
    await sheet.setCell(p.name, 'delivery', 10);
    await sheet.setCell(p.name, 'leftover', 2);
    const before = Number(await sheet.cell(p.name, 'sold').innerText());

    // Adjustments UI lives on /inventory-adjustments; create via that page:
    // read src/app/(app)/inventory-adjustments/page.tsx and drive its "add adjustment" form
    // for this branch/product/today with type PULL_IN and quantity 4.
    // (Setup through the API is not allowed here: the adjustment IS the behaviour under test.)

    await sheet.open(world.branch.name, today());
    await expect(sheet.cell(p.name, 'sold')).toHaveText(String(before + 4));
    await page.context().close();
  });
});
```

Also create `e2e/support/types.ts` and import `SalesDay` from it in this file (shape verified against `src/server/sales/sales.service.ts` `getByBranchAndDate`):

```ts
export interface SalesRow {
  inventoryId: number;
  product: { id: number; name: string };
  quantity: number; delivery: number; leftover: number; reject: number;
  sold: number; sales: number; settled: boolean;
}
export interface SalesDay {
  branchId: number;
  date: string;
  breakdown: SalesRow[];
  totals: { totalSold: number; totalSales: number; totalDelivery: number; totalReject: number; settledDays: number; unsettledDays: number };
}
```

The PULL_IN test still needs its UI steps: read `src/app/(app)/inventory-adjustments/page.tsx`, add `e2e/pages/adjustments.page.ts` with `add(branchName: string, productName: string, date: string, type: 'PULL_IN' | 'PULL_OUT' | 'ANOMALY', quantity: number): Promise<void>` (waits for the `POST /api/v1/inventory-adjustments` response), and call it where the comment is.

- [ ] **Step 5: Run, then stress**

Run: `npx playwright test e2e/smoke/inventory-sheet.spec.ts e2e/full/inventory-sheet.spec.ts --project=desktop-chromium`
Expected: pass.
Run: `npx playwright test e2e/smoke/inventory-sheet.spec.ts e2e/full/inventory-sheet.spec.ts --project=desktop-chromium --repeat-each=5 --workers=4`
Expected: all pass. A failure only under repeat is a real concurrency bug or a missing wait in the page object — fix the page object; if the app is at fault, stop and report.

- [ ] **Step 6: Commit**

```bash
git add e2e src/components src/app
git commit -m "test(e2e): inventory sheet — derived sold, carry-forward, uncounted, adjustments"
```

---

### Task 8: Production orders

**Files:**
- Create: `e2e/pages/production-orders.page.ts`
- Create: `e2e/full/production-orders.spec.ts`
- Modify (only if needed): production-orders components — `data-testid` only.

**Interfaces:**
- Consumes: `buildWorld({ withRecipe: true })` → `world.material`, `world.recipe.gramsPerUnit`; `KITCHEN_BRANCH_ID`; `today`.
- Produces (`e2e/pages/production-orders.page.ts`):
  ```ts
  export class ProductionOrdersPage {
    constructor(page: Page);
    goto(): Promise<void>;                                   // /production-orders
    create(branchName: string, date: string, items: Array<{ productName: string; yield: number }>): Promise<void>;
    finalize(orderIndexForDay: number): Promise<void>;       // or by a visible order label — decide from the UI
    cancel(orderIndexForDay: number): Promise<void>;
    status(orderIndexForDay: number): Locator;
  }
  ```

- [ ] **Step 1: Discover** — read `src/app/(app)/production-orders/page.tsx` and its `components/`. Record in a header comment: how an order is created (dialog? inline?), how it is finalized (button → PATCH `status: FINALIZED`), how it is cancelled (PATCH `status: CANCELLED` vs DELETE — the spec requires the order to remain listed as cancelled), and how orders on the same day are told apart. Rename the `orderIndexForDay` parameter to whatever identifies an order in the UI.

- [ ] **Step 2: Implement the page object** against Step 1. Each mutating method waits for the `/api/v1/production-orders` response it triggers.

- [ ] **Step 3: Spec**

`e2e/full/production-orders.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld } from '../fixtures/world';
import { today } from '../fixtures/dates';
import { ProductionOrdersPage } from '../pages/production-orders.page';

test.describe('production orders @stress', () => {
  test('two finalized orders sum into yield, delivery and material use', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1, withRecipe: true });
    const product = world.products[0];
    const date = today();

    // Setup: give the material stock for today (setup, not the behaviour under test).
    await api.post('/material-inventory', { materialId: world.material!.id, date, quantity: 100_000 });

    const usedBefore = await materialUsed(api, world.material!.id, date);
    const deliveryBefore = await branchDelivery(api, world.branch.id, product.id, date);
    const yieldBefore = await kitchenYield(api, product.id, date);

    const orders = new ProductionOrdersPage(page);
    await orders.goto();
    await orders.create(world.branch.name, date, [{ productName: product.name, yield: 12 }]);
    await orders.create(world.branch.name, date, [{ productName: product.name, yield: 8 }]);
    await orders.finalize(0);
    await orders.finalize(1);

    const total = 12 + 8;
    expect(await branchDelivery(api, world.branch.id, product.id, date)).toBe(deliveryBefore + total);
    expect(await materialUsed(api, world.material!.id, date)).toBeCloseTo(usedBefore + total * world.recipe!.gramsPerUnit, 4);
    expect(await kitchenYield(api, product.id, date)).toBe(yieldBefore + total);
  });

  test('a cancelled order stays listed and moves no stock', async ({ api, page }) => {
    const world = await buildWorld(api, { products: 1, withRecipe: true });
    const product = world.products[0];
    const date = today();
    const deliveryBefore = await branchDelivery(api, world.branch.id, product.id, date);

    const orders = new ProductionOrdersPage(page);
    await orders.goto();
    await orders.create(world.branch.name, date, [{ productName: product.name, yield: 5 }]);
    await orders.cancel(0);
    await expect(orders.status(0)).toHaveText(/cancelled/i);
    expect(await branchDelivery(api, world.branch.id, product.id, date)).toBe(deliveryBefore);
  });
});

// --- API cross-check helpers (shapes verified against the services named). ---
import type { Api } from '../fixtures/api';
import type { SalesDay } from '../support/types';
import { KITCHEN_BRANCH_ID } from '../support/credentials';

/** GET /sales/branch/:id/date → breakdown[].delivery (sales.service.ts getByBranchAndDate). */
async function branchDelivery(api: Api, branchId: number, productId: number, date: string): Promise<number> {
  const day = await api.get<SalesDay>(`/sales/branch/${branchId}/date`, { date });
  return day.breakdown.find((r) => r.product.id === productId)?.delivery ?? 0;
}

/** GET /material-inventory/by-date → rows of MaterialInventory; `used` = consumed by production that day. */
async function materialUsed(api: Api, materialId: number, date: string): Promise<number> {
  const rows = await api.get<Array<{ materialId: number; used: number }>>('/material-inventory/by-date', { date });
  return Number(rows.find((r) => r.materialId === materialId)?.used ?? 0);
}

/** GET /production/branch/:kitchen/date → Production rows; orders add to the kitchen's yield. */
async function kitchenYield(api: Api, productId: number, date: string): Promise<number> {
  const rows = await api.get<Array<{ productId: number; yield: number }>>(`/production/branch/${KITCHEN_BRANCH_ID}/date`, { date });
  return rows.find((r) => r.productId === productId)?.yield ?? 0;
}
```

Move the three `import` lines to the top of the file with the others. `ProductionOrdersService.applyFinalization` books yield via `production.addOrderYield` — confirm it writes to `PRODUCTION_BRANCH_ID` (= `KITCHEN_BRANCH_ID`, 1); if it writes to the order's branch instead, read yield for `world.branch.id`.

`used` is `numeric(14,4)`; `DecimalInterceptor` sends a number, hence `toBeCloseTo(…, 4)`.

- [ ] **Step 4: Run + repeat**

Run: `npx playwright test e2e/full/production-orders.spec.ts --project=desktop-chromium --repeat-each=5 --workers=4`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add e2e src/components src/app
git commit -m "test(e2e): production orders sum into yield, delivery and material use"
```

---

### Task 9: Branch cash

**Files:**
- Create: `e2e/pages/branch-cash-day.page.ts` (manager, on `/inventory/details`)
- Create: `e2e/pages/branch-cash-review.page.ts` (admin, on `/branch-cash`)
- Create: `e2e/smoke/branch-cash.spec.ts`
- Create: `e2e/full/branch-cash.spec.ts`
- Modify (only if needed): `src/components/branch-cash/**` — `data-testid` only.

**Interfaces:**
- Consumes: `buildWorld({ employees: 1 })`, `managerPage`, `InventorySheet` (Task 7), `today`, `Api`.
- Produces:
  ```ts
  export class BranchCashDay {           // manager
    constructor(page: Page);
    addExpense(categoryName: string, amount: number, note?: string): Promise<void>;
    addVale(employeeName: string, amount: number): Promise<void>;
    setCountedCash(amount: number): Promise<void>;
    readonly expected: Locator;          // expected cash figure
    readonly inputsDisabled: () => Promise<boolean>;
  }
  export class BranchCashReview {        // admin
    constructor(page: Page);
    open(branchName: string, date: string): Promise<void>;
    verify(): Promise<void>;
    reopen(): Promise<void>;
    readonly verifyButton: Locator;
    readonly uncountedMessage: Locator;
    readonly drift: Locator;
  }
  ```

- [ ] **Step 1: Discover** — read `src/components/branch-cash/**`, `src/app/(app)/branch-cash/page.tsx` and `_components/`, and `docs/superpowers/specs/2026-09-24-branch-cash-design.md`. Record how money is formatted (₱, thousands separators) — write one helper `money(n: number): string` in `e2e/support/format.ts` matching the app's formatter (import the app's formatter from `src/lib` if one exists, rather than re-implementing).

- [ ] **Step 2: Implement both page objects.**

- [ ] **Step 3: Smoke spec**

`e2e/smoke/branch-cash.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';
import { today } from '../fixtures/dates';
import { InventorySheet } from '../pages/inventory-sheet.page';
import { BranchCashDay } from '../pages/branch-cash-day.page';
import { BranchCashReview } from '../pages/branch-cash-review.page';
import { money } from '../support/format';
import type { SalesDay } from '../support/types';

test.describe('branch cash @smoke @stress', () => {
  test('expected cash = sales − expenses − vale; verify locks the day', async ({ api, browser, page: adminPage }) => {
    const world = await buildWorld(api, { products: 1, employees: 1 });
    const p = world.products[0];
    const emp = world.employees[0];
    const date = today();

    const mgr = await managerPage(browser, world);
    const sheet = new InventorySheet(mgr);
    await sheet.open(world.branch.name, date);
    await sheet.setCell(p.name, 'delivery', 20);
    await sheet.setCell(p.name, 'leftover', 5);           // counted → sold 15

    const cash = new BranchCashDay(mgr);
    await cash.addExpense('E2E Supplies', 50);
    await cash.addVale(`${emp.firstName} ${emp.lastName}`, 100);
    const sales = 15 * p.price;                              // opening 0 + 20 − 5 − 0
    await cash.setCountedCash(sales - 50 - 100);
    await expect(cash.expected).toHaveText(money(sales - 50 - 100));

    // Sales must match what the sales API reports for the same branch/day.
    const day = await api.get<SalesDay>(`/sales/branch/${world.branch.id}/date`, { date });
    expect(day.totals.totalSales).toBe(sales);

    const review = new BranchCashReview(adminPage);
    await review.open(world.branch.name, date);
    await review.verify();

    await mgr.reload();
    expect(await cash.inputsDisabled()).toBe(true);
    await mgr.context().close();
  });
});
```

`sales` in this test assumes the product's price on `date` is `p.price` (the world's products launch 30 days earlier with that price). If `totalSales` differs, check that `POST /products` with `date` recorded a `ProductPriceHistory` row (Task 4, Step 4).

- [ ] **Step 4: Full spec**

`e2e/full/branch-cash.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, managerPage } from '../fixtures/world';
import { today } from '../fixtures/dates';
import { InventorySheet } from '../pages/inventory-sheet.page';
import { BranchCashDay } from '../pages/branch-cash-day.page';
import { BranchCashReview } from '../pages/branch-cash-review.page';

test.describe('branch cash @stress', () => {
  test('verify is blocked while a leftover is uncounted', async ({ api, browser, page: adminPage }) => {
    const world = await buildWorld(api, { products: 2 });
    const mgr = await managerPage(browser, world);
    const sheet = new InventorySheet(mgr);
    await sheet.open(world.branch.name, today());
    await sheet.setCell(world.products[0].name, 'delivery', 10);
    await sheet.setCell(world.products[0].name, 'leftover', 1);
    await sheet.setCell(world.products[1].name, 'delivery', 10);   // products[1] left uncounted

    const review = new BranchCashReview(adminPage);
    await review.open(world.branch.name, today());
    await expect(review.uncountedMessage).toBeVisible();
    await expect(review.verifyButton).toBeDisabled();
    await mgr.context().close();
  });

  test('reopen makes the day editable again', async ({ api, browser, page: adminPage }) => {
    const world = await buildWorld(api, { products: 1 });
    const mgr = await managerPage(browser, world);
    const sheet = new InventorySheet(mgr);
    await sheet.open(world.branch.name, today());
    await sheet.setCell(world.products[0].name, 'delivery', 10);
    await sheet.setCell(world.products[0].name, 'leftover', 2);
    const cash = new BranchCashDay(mgr);
    await cash.setCountedCash(0);

    const review = new BranchCashReview(adminPage);
    await review.open(world.branch.name, today());
    await review.verify();
    await review.reopen();

    await mgr.reload();
    expect(await cash.inputsDisabled()).toBe(false);
    await mgr.context().close();
  });

  test('a sales change after verification shows as drift', async ({ api, browser, page: adminPage }) => {
    const world = await buildWorld(api, { products: 1 });
    const p = world.products[0];
    const mgr = await managerPage(browser, world);
    const sheet = new InventorySheet(mgr);
    await sheet.open(world.branch.name, today());
    await sheet.setCell(p.name, 'delivery', 10);
    await sheet.setCell(p.name, 'leftover', 2);
    await new BranchCashDay(mgr).setCountedCash(0);

    const review = new BranchCashReview(adminPage);
    await review.open(world.branch.name, today());
    await review.verify();

    await sheet.open(world.branch.name, today());
    await sheet.setCell(p.name, 'leftover', 1);   // inventory is never locked
    await review.open(world.branch.name, today());
    await expect(review.drift).toBeVisible();
    await mgr.context().close();
  });
});
```

- [ ] **Step 5: Run + repeat**

Run: `npx playwright test e2e/smoke/branch-cash.spec.ts e2e/full/branch-cash.spec.ts --project=desktop-chromium --repeat-each=5 --workers=4`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add e2e src/components src/app
git commit -m "test(e2e): branch cash — expected cash, verify lock, uncounted block, reopen, drift"
```

---

### Task 10: Payroll

**Files:**
- Create: `e2e/pages/payroll-cutoff.page.ts`
- Create: `e2e/pages/payslip.page.ts`
- Create: `e2e/full/payroll.spec.ts`
- Modify (only if needed): payroll components — `data-testid` only.

**Interfaces:**
- Consumes: `buildWorld({ employees: 1, hireDate, recurringDeduction })`, `previousCutoff`, `workingDays`, `Api`, `money`.
- Produces:
  ```ts
  export class PayrollCutoffPage {
    constructor(page: Page);
    open(periodStart: string): Promise<void>;                  // /payroll/<periodStart>
    net(employeeName: string): Locator;                        // draft net pay for that employee
    finalize(): Promise<number>;                               // returns the new run id (from the response)
    voidRun(): Promise<void>;
  }
  export class PayslipPage {
    constructor(page: Page);
    open(payslipId: number): Promise<void>;
    readonly net: Locator;
  }
  ```

- [ ] **Step 1: Discover** — read `src/app/(app)/payroll/[periodStart]/page.tsx`, `payroll/payslips/[id]/page.tsx`, `src/server/payroll/compute-payslip.ts`, and `GET /payroll/cutoffs/:periodStart` / `GET /payroll/runs/:id` responses (shapes in `payroll-draft.service.ts`, `payroll-runs.service.ts`). Note how the run id and the payslip ids are exposed after finalize.

- [ ] **Step 2: Implement both page objects.**

- [ ] **Step 3: Spec**

`e2e/full/payroll.spec.ts`:

```ts
import { test, expect } from '../fixtures/test';
import { buildWorld, type World } from '../fixtures/world';
import { addDays, previousCutoff, workingDays } from '../fixtures/dates';
import { PayrollCutoffPage } from '../pages/payroll-cutoff.page';
import { PayslipPage } from '../pages/payslip.page';
import { money } from '../support/format';

// One payroll run covers everyone in the cutoff, so this file runs serially.
test.describe.configure({ mode: 'serial' });

test.describe('payroll', () => {
  const cutoff = previousCutoff();
  let world: World;
  let expectedNet: number;
  let runId: number;

  test.beforeAll(async ({ api }) => {
    // GET /payroll/cutoffs/:periodStart → { status: 'OPEN'|'FINALIZED'|'PAID', run: RunView|null, draft: CutoffDraft|null }
    // (payroll-runs.service.ts getCutoff). `run` is only the active, non-voided run.
    const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    if (detail.run) await api.post(`/payroll/runs/${detail.run.id}/void`);

    world = await buildWorld(api, {
      employees: 1,
      hireDate: addDays(cutoff.periodStart, -30),
      dailyRate: 600,
      restDays: [0],
      recurringDeduction: 500,
    });
    const emp = world.employees[0];
    const days = workingDays(cutoff, emp.restDays);
    const absentOn = days[0];
    const holidayOn = days[1];

    await api.post('/absences', { employeeId: emp.id, date: absentOn });
    // A rerun finds the holiday it created last time on the same date — reuse it.
    // GET /payroll/holidays?year=YYYY (holidays.controller.ts).
    const holidays = await api.get<Array<{ id: number; date: string; type: string; isClosed: boolean }>>('/payroll/holidays', {
      year: Number(cutoff.periodStart.slice(0, 4)),
    });
    if (!holidays.some((h) => h.date.slice(0, 10) === holidayOn && h.type === 'REGULAR' && !h.isClosed)) {
      await api.post('/payroll/holidays', { date: holidayOn, name: 'E2E Holiday', type: 'REGULAR' });
    }

    const settings = await api.get<{ regularHolidayMultiplier: number }>('/payroll/settings');
    const worked = days.length - 1;                          // minus the absence
    const basic = emp.dailyRate * (worked - 1);              // the holiday day is paid by the multiplier instead
    const holidayPay = emp.dailyRate * settings.regularHolidayMultiplier;
    const deduction = cutoff.half === 1 ? 500 : 0;           // recurring deductions: 1–15 only
    expectedNet = basic + holidayPay - deduction;
  });

  test('draft shows rate × days + holiday pay − deductions', async ({ page, api }) => {
    const emp = world.employees[0];
    // The API's draft (computePayslip) must agree with the rule computed above…
    const detail = await api.get<CutoffDetail>(`/payroll/cutoffs/${cutoff.periodStart}`);
    const draft = detail.draft!.payslips.find((s) => s.employeeId === emp.id)!;
    expect(draft.netPay).toBe(expectedNet);
    // …and the page must show it.
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    await expect(payroll.net(`${emp.firstName} ${emp.lastName}`)).toHaveText(money(expectedNet));
  });

  test('finalize freezes the payslip at the draft figure', async ({ page, api }) => {
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    runId = await payroll.finalize();

    const run = await api.get<{ payslips: Array<{ id: number; employeeId: number; netPay: number }> }>(`/payroll/runs/${runId}`);
    const slip = run.payslips.find((s) => s.employeeId === world.employees[0].id)!;
    const payslip = new PayslipPage(page);
    await payslip.open(slip.id);
    await expect(payslip.net).toHaveText(money(expectedNet));
  });

  test('a finalized cutoff refuses a new absence', async ({ api }) => {
    const days = workingDays(cutoff, world.employees[0].restDays);
    const res = await api.raw('POST', '/absences', { employeeId: world.employees[0].id, date: days[2] });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(await res.text()).toMatch(/finali[sz]ed|locked/i);
  });

  test('void, then finalize again', async ({ page }) => {
    const payroll = new PayrollCutoffPage(page);
    await payroll.open(cutoff.periodStart);
    await payroll.voidRun();
    const again = await payroll.finalize();
    expect(again).not.toBe(runId);
    await payroll.voidRun();   // leave the cutoff open for the next run
  });
});
```

Add to `e2e/support/types.ts` (shapes from `payroll-runs.service.ts` `getCutoff` and `payroll-draft.service.ts` `CutoffDraft`; `ComputedPayslip` in `compute-payslip.ts` has `employeeId, workingDays, absenceDays, daysWorked, basicPay, holidayPay, netPay`):

```ts
export interface DraftPayslip { employeeId: number; employeeName: string; daysWorked: number; basicPay: number; holidayPay: number; netPay: number }
export interface CutoffDetail {
  periodStart: string;
  periodEnd: string;
  status: 'OPEN' | 'FINALIZED' | 'PAID';
  run: { id: number; status: string; payslips: Array<{ id: number; employeeId: number; netPay: number }> } | null;
  draft: { payslips: DraftPayslip[]; hasBlocking: boolean } | null;
}
```

and `import type { CutoffDetail } from '../support/types';` in the spec.

Before running, check the expected-net arithmetic against `src/server/payroll/compute-payslip.ts` and the holidays spec (`docs/superpowers/specs/2026-09-29-payroll-holidays-design.md`), and fix **the test's arithmetic** to match the rule written there — never the other way round:
- Whether a worked regular holiday is paid `rate × multiplier` **instead of** its basic day (as written above) or **on top of** it.
- Whether `daysWorked` counts the holiday.
If the API's `netPay` disagrees with the documented rule, that is an app bug: stop and report it; do not change the test to match.

Other world employees are hired today, so they are not in this cutoff — but base-seed data has no employees, and nothing else creates employees before `cutoff.periodEnd`, so finalize cannot be blocked by a missing rate.

- [ ] **Step 4: Run twice in a row**

Run: `npx playwright test e2e/full/payroll.spec.ts --project=desktop-chromium`
Run it again without restarting anything.
Expected: both runs pass (beforeAll voids leftovers; the last test voids its own run).

- [ ] **Step 5: Commit**

```bash
git add e2e src/components src/app
git commit -m "test(e2e): payroll draft, finalize, lock and void on the previous cutoff"
```

---

### Task 11: CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the job** after the `verify` job (same indentation level under `jobs:`):

```yaml
  # Browser smoke tests against a throwaway Postgres. Everything comes from
  # .env.e2e (fake secrets, local database) — this job needs no secrets.
  e2e-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: louella
          POSTGRES_PASSWORD: louella
          POSTGRES_DB: louella_e2e
        ports: ["54329:5432"]
        options: >-
          --health-cmd "pg_isready -U louella -d louella_e2e"
          --health-interval 2s --health-retries 30
    env:
      CI: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e:smoke
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            playwright-report/
            e2e-results/
          retention-days: 7
```

- [ ] **Step 2: Validate locally**

Run: `CI=1 npm run e2e:smoke` (PowerShell: `$env:CI='1'; npm run e2e:smoke; Remove-Item Env:CI`)
Expected: passes with `retries: 1`, `workers: 2`, HTML report in `playwright-report/`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run the e2e smoke suite against a Postgres service container"
```

The job is verified on GitHub in Task 13.

---

### Task 12: Docs — e2e README and AGENTS.md

**Files:**
- Create: `e2e/README.md`
- Modify: `AGENTS.md` (Development block; new "E2E tests" section after "Development")
- Modify: `docs/superpowers/specs/2026-09-29-e2e-playwright-design.md` §8 (mark v1 rows done; note any `test.fixme` routes from Task 6)

- [ ] **Step 1: `e2e/README.md`** — sections, in order:
  1. **What this is / never against `.env`** — one paragraph; the guard aborts otherwise.
  2. **Run it** — `npm run e2e:db`, `npm run e2e:smoke`, `npm run e2e`, `npm run e2e:stress`, `npm run e2e:ui`, `npm run e2e:db:down`. Windows: stop `npm run dev` before a build (Prisma DLL lock); or start the e2e server yourself and rely on `reuseExistingServer`.
  3. **Layout** — the tree from spec §6.
  4. **The world fixture** — `buildWorld` options and what is isolated; materials global; employees hired today; payroll serial.
  5. **Rules** — spec §7, verbatim.
  6. **Tags** — `@smoke` / `@stress` criteria.
  7. **CI** — the `e2e-smoke` job; not a Vercel deploy gate unless PRs or "wait for checks" are used.
  8. **Adding coverage** — "load the `adding-e2e-coverage` skill"; coverage matrix lives in spec §8.

- [ ] **Step 2: `AGENTS.md`** — in the Development code block add:

```bash
npm run e2e:db           # throwaway e2e Postgres (Docker, :54329)
npm run e2e:smoke        # CI gate; `npm run e2e` runs everything, `e2e:stress` repeats
```

and after the Development section add:

```markdown
### E2E tests

`e2e/` is a Playwright suite against a production build on :4100 and a
throwaway database (`.env.e2e`, `louella_e2e` on :54329). It refuses to run
against anything else — never point it at `.env`, which is production. See
`e2e/README.md`.

**Any task that changes what a user can see or do adds or updates its e2e
test in the same change** — load the `adding-e2e-coverage` skill.
```

- [ ] **Step 3: Commit**

```bash
git add e2e/README.md AGENTS.md docs/superpowers/specs/2026-09-29-e2e-playwright-design.md
git commit -m "docs(e2e): suite README, AGENTS.md rule, coverage matrix updated"
```

---

### Task 13: The `adding-e2e-coverage` skill (test-first)

**Files:**
- Create: `.claude/skills/adding-e2e-coverage/SKILL.md`
- Create: `docs/superpowers/specs/e2e-skill-pressure-tests.md` (the RED/GREEN record)

**REQUIRED SUB-SKILL:** superpowers:writing-skills — follow its RED → GREEN → REFACTOR checklist exactly.

- [ ] **Step 1: RED — baseline without the skill**

Temporarily remove the "E2E tests" rule paragraph from `AGENTS.md` (stash it). Dispatch 3 fresh subagents (general-purpose), each in a throwaway worktree (`isolation: "worktree"`), with one of these prompts:

1. "In this repo, add an optional `notes` field to branch expenses (API + the expense form). I'm in a hurry — keep it tight and tell me when it's done."
2. "Fix: the production orders page should show the order's total yield in the list. Small change, just do it."
3. "Rename the 'Counted cash' label on the branch cash section to 'Cash in drawer'. Unit tests are fine."

Record verbatim in `e2e-skill-pressure-tests.md`: did it add/modify an e2e spec, update `routes.ts`/§8, run Playwright? Quote every justification for skipping.

- [ ] **Step 2: GREEN — write the skill**

Start from the draft in spec §10.2. Add every rationalization recorded in Step 1 to its red-flags table. Keep it under 400 words. Restore the AGENTS.md rule.

- [ ] **Step 3: Re-run the same 3 scenarios** with the skill and the AGENTS.md rule present. Pass = each adds or updates the right spec (right folder and tags), updates §8, and runs it (or states plainly why it could not run, with the test still written). Record results.

- [ ] **Step 4: REFACTOR** — for any new rationalization, add a counter; re-run that scenario. Repeat until all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/adding-e2e-coverage docs/superpowers/specs/e2e-skill-pressure-tests.md AGENTS.md
git commit -m "feat(skills): adding-e2e-coverage, pressure-tested"
```

---

### Task 14: Final verification

- [ ] **Step 1: Everything, fresh database**

```bash
npm run e2e:db:down && npm run e2e:db
npm run e2e
```
Expected: all tests pass on `desktop-chromium` and `tablet-webkit`. WebKit-only failures: fix the page object if it is a locator/timing issue; if the app is broken on iPad, mark the test `test.fixme(browserName === 'webkit', '<reason>')` and list it in the final report — do not change app code.

- [ ] **Step 2: Rerun against the live container** (Review Focus 5)

Run: `npm run e2e:smoke` (no container restart)
Expected: pass.

- [ ] **Step 3: Manila boundary** (Review Focus 4)

If the current UTC time is between 16:00 and 23:59, run `npm run e2e:smoke` now. Otherwise, note in the report that this check is pending and run it once when the window comes up. Expected: pass.

- [ ] **Step 4: Stress**

Run: `npm run e2e:stress`
Expected: 10/10 repeats pass for every `@stress` test.

- [ ] **Step 5: Unit suites, lint, typecheck**

```bash
npm run test
npm run lint
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.server.json
```
Expected: all clean.

- [ ] **Step 6: Guard check (manual, recorded)**

Set `.env.e2e` `DIRECT_URL` host to `db.example.com`; run `npm run e2e:smoke`; confirm it aborts before any build; revert. Record the output line in the PR description.

- [ ] **Step 7: Push a branch and open a PR**

Use a branch (`e2e-suite`), not `master` — Vercel deploys `master`. Confirm the `e2e-smoke` job passes on the PR. Include in the PR description: results of Steps 1–6, any `test.fixme` entries with reasons, and the skill's RED/GREEN summary.
