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
