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

  return config;
}
