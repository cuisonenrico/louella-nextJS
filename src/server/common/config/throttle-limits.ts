/**
 * Rate limits, relaxable for the e2e suite only.
 *
 * Every e2e request comes from one IP, so the production limits (20/min
 * globally, 5/min on login) would 429 the suite within seconds. The flag is
 * refused at boot unless DATABASE_URL is local — see env.validation.ts — so it
 * cannot take effect on a real deployment.
 */
export const RELAXED_THROTTLE_LIMIT = 10_000;

export function throttleLimit(
  defaultLimit: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  return env.E2E_RELAX_THROTTLE === '1' ? RELAXED_THROTTLE_LIMIT : defaultLimit;
}
