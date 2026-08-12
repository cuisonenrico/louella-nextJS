import { validateEnv } from './env.validation';

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
