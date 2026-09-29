import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const E2E_ENV_FILE = '.env.e2e';
const SAFE_HOSTS = new Set(['localhost', '127.0.0.1']);
const SAFE_DB = '/louella_e2e';

/** Minimal dotenv parser: KEY=VALUE per line, # comments, no interpolation. */
function parse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    // dotenv (which Next uses) honours an `export ` prefix, so we do too.
    const line = raw.trim().replace(/^export\s+/, '');
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

export function envKeys(text: string): string[] {
  return Object.keys(parse(text));
}

export function unionKeys(texts: string[]): string[] {
  return [...new Set(texts.flatMap(envKeys))];
}

/**
 * Every key that could reach the e2e server from an env file: the template plus every file Next
 * loads. A key present in .env / .env.local but missing from .env.e2e would silently keep its
 * production value, whether or not it is documented in .env.example.
 */
export function allTemplateKeys(files = ['.env.example', ...NEXT_ENV_FILES]): string[] {
  const texts = files.flatMap((f) => {
    try {
      return [readFileSync(resolve(process.cwd(), f), 'utf8')];
    } catch {
      return []; // file does not exist (CI has only .env.example)
    }
  });
  return unionKeys(texts);
}

const NEXT_ENV_FILES = ['.env', '.env.local', '.env.production', '.env.production.local'];

/** True if the dotenv text sets NEXT_PUBLIC_API_URL at all — even blank. */
export function definesApiUrl(text: string): boolean {
  return 'NEXT_PUBLIC_API_URL' in parse(text);
}

/**
 * api.ts does `NEXT_PUBLIC_API_URL ?? '/api/v1'`, and the value is inlined at
 * build time. A blank value is not "unset": it sends the browser to /auth/login.
 * A real value would point the e2e browser at another API. So the key must be
 * absent from every file Next reads (and from .env.e2e).
 */
export function assertNoApiUrlOverride(
  files: string[] = [...NEXT_ENV_FILES, E2E_ENV_FILE],
  processEnv: Record<string, string | undefined> = process.env,
): void {
  // Exported in the shell: the value is spread into the server's env and baked into the build.
  if ('NEXT_PUBLIC_API_URL' in processEnv) {
    throw new Error('[e2e] NEXT_PUBLIC_API_URL is set in your shell environment. Unset it — it must be absent, not blank.');
  }
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(resolve(process.cwd(), file), 'utf8');
    } catch {
      continue; // file does not exist
    }
    if (definesApiUrl(text)) {
      throw new Error(`[e2e] ${file} sets NEXT_PUBLIC_API_URL. Remove the line — it must be absent, not blank.`);
    }
  }
}

/** Prisma's Postgres connector lets these query parameters override the URL's host. */
const HOST_OVERRIDES = ['host', 'hostaddr'];

function isSafe(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const overridden = [...u.searchParams.keys()].some((k) => HOST_OVERRIDES.includes(k.toLowerCase()));
    return !overridden && SAFE_HOSTS.has(u.hostname.toLowerCase()) && u.pathname === SAFE_DB;
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
