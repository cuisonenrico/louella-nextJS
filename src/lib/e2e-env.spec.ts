import { describe, expect, it } from 'vitest';
import {
  assertEnvComplete,
  assertNoApiUrlOverride,
  assertSafeDatabase,
  definesApiUrl,
  envKeys,
  unionKeys,
} from '../../e2e/support/env';

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

  // Prisma's Postgres connector lets a `host` query parameter override the URL's host.
  it.each([
    ['host', '?host=db.abc.supabase.co'],
    ['hostaddr', '?hostaddr=203.0.113.9'],
    ['HOST in caps', '?HOST=db.abc.supabase.co'],
    ['host among others', '?schema=public&host=db.abc.supabase.co'],
  ])('refuses a %s override hidden in the query', (_label, q) => {
    expect(() => assertSafeDatabase(env(url('localhost', 'louella_e2e', q)))).toThrow(/louella_e2e/);
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

// api.ts does `NEXT_PUBLIC_API_URL ?? '/api/v1'`: a blank value is NOT unset, it
// makes the browser post to /auth/login. The key must be absent from every file Next reads.
describe('definesApiUrl', () => {
  it.each([
    ['a real url', 'NEXT_PUBLIC_API_URL=https://api.example.com\n', true],
    ['a blank value', 'NEXT_PUBLIC_API_URL=\n', true],
    ['absent', 'DATABASE_URL=x\n', false],
    ['commented out', '# NEXT_PUBLIC_API_URL=https://api.example.com\n', false],
  ])('%s', (_label, text, expected) => {
    expect(definesApiUrl(text)).toBe(expected);
  });
});

// dotenv (which Next uses) honours an `export ` prefix, so the guards must too.
describe('env parsing', () => {
  it('reads keys with an export prefix', () => {
    expect(envKeys('export FOO=1\nBAR=2\n# BAZ=3\n')).toEqual(['FOO', 'BAR']);
  });

  it('unions the keys of several files', () => {
    expect(unionKeys(['A=1\nB=2\n', 'B=9\nC=3\n', ''])).toEqual(['A', 'B', 'C']);
  });

  it('catches NEXT_PUBLIC_API_URL behind an export prefix', () => {
    expect(definesApiUrl('export NEXT_PUBLIC_API_URL=https://api.example.com\n')).toBe(true);
  });
});

describe('assertNoApiUrlOverride against the process environment', () => {
  it('refuses a value exported in the shell, even blank', () => {
    expect(() => assertNoApiUrlOverride([], { NEXT_PUBLIC_API_URL: '' })).toThrow(/NEXT_PUBLIC_API_URL/);
    expect(() => assertNoApiUrlOverride([], { NEXT_PUBLIC_API_URL: 'https://x' })).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('passes when it is not set anywhere', () => {
    expect(() => assertNoApiUrlOverride([], {})).not.toThrow();
  });
});
