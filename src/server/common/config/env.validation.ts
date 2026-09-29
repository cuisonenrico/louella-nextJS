/**
 * Fail-fast validation for required environment variables.
 *
 * Wired into ConfigModule.forRoot({ validate }). Nest runs this at boot, so a
 * missing JWT secret or database URL crashes the process immediately with a
 * clear message instead of surfacing as an opaque 500 on the first request.
 */
const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

// Reject the weak placeholders that ship in .env.example so they can never
// reach a real deployment unnoticed.
const FORBIDDEN_SECRET_VALUES = new Set([
  'changeme',
  'secret',
  'your-secret-here',
]);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Prisma's Postgres connector lets these query parameters override the URL's host. */
const HOST_OVERRIDES = ['host', 'hostaddr'];

/** True only for a postgres URL whose host is exactly localhost or 127.0.0.1, with no host override. */
export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const overridden = [...u.searchParams.keys()].some((k) => HOST_OVERRIDES.includes(k.toLowerCase()));
    return !overridden && LOCAL_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Set them before starting the server (see .env.example).`,
    );
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    const value = String(config[key]);
    if (value.length < 16 || FORBIDDEN_SECRET_VALUES.has(value)) {
      throw new Error(
        `${key} is too weak — use a random secret of at least 16 characters.`,
      );
    }
  }

  // The e2e suite relaxes rate limits. That must never reach a real
  // deployment, so the flag is only accepted against a local database.
  if (
    config.E2E_RELAX_THROTTLE === '1' &&
    !isLocalDatabaseUrl(String(config.DATABASE_URL))
  ) {
    throw new Error(
      'E2E_RELAX_THROTTLE is set but DATABASE_URL is not a local database. ' +
        'The flag is for the e2e suite only.',
    );
  }

  return config;
}
