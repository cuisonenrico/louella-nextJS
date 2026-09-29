import { isLocalDatabaseUrl, validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://localhost:5432/db',
  JWT_ACCESS_SECRET: 'a-sufficiently-long-secret',
  JWT_REFRESH_SECRET: 'another-long-enough-secret',
};

describe('validateEnv', () => {
  it('returns the config when all required vars are present and strong', () => {
    expect(validateEnv({ ...valid })).toMatchObject(valid);
  });

  it('throws when a required variable is missing', () => {
    const { JWT_ACCESS_SECRET, ...rest } = valid;
    void JWT_ACCESS_SECRET;
    expect(() => validateEnv(rest)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when a secret is too short', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /too weak/,
    );
  });

  it('throws on a well-known placeholder secret', () => {
    expect(() =>
      validateEnv({ ...valid, JWT_REFRESH_SECRET: 'changeme' }),
    ).toThrow(/too weak/);
  });
});

describe('E2E_RELAX_THROTTLE guard', () => {
  it('accepts the flag with a localhost database', () => {
    expect(() =>
      validateEnv({
        ...valid,
        DATABASE_URL: 'postgresql://u:p@localhost:54329/louella_e2e',
        E2E_RELAX_THROTTLE: '1',
      }),
    ).not.toThrow();
  });

  it('refuses the flag with a remote database', () => {
    expect(() =>
      validateEnv({
        ...valid,
        DATABASE_URL:
          'postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
        E2E_RELAX_THROTTLE: '1',
      }),
    ).toThrow(/E2E_RELAX_THROTTLE/);
  });

  it('ignores a remote database when the flag is unset', () => {
    expect(() =>
      validateEnv({
        ...valid,
        DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres',
      }),
    ).not.toThrow();
  });
});

describe('isLocalDatabaseUrl', () => {
  it.each([
    ['postgresql://u:p@localhost:54329/louella_e2e', true],
    ['postgresql://u:p@127.0.0.1:54329/louella_e2e', true],
    ['postgresql://u:p@LOCALHOST:54329/louella_e2e', true],
    ['postgresql://u:p@localhost.evil.com:5432/x', false],
    // A `host`/`hostaddr` query parameter overrides the URL's host in Prisma's connector.
    ['postgresql://u:p@localhost:54329/louella_e2e?host=db.x.supabase.co', false],
    ['postgresql://u:p@localhost:54329/louella_e2e?hostaddr=203.0.113.9', false],
    ['postgresql://u:p@localhost:54329/louella_e2e?schema=public', true],
    ['postgresql://u:p@db.supabase.co:5432/postgres', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isLocalDatabaseUrl(url)).toBe(expected);
  });
});
