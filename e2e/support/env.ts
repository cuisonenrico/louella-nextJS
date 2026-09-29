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
