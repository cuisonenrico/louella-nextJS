/**
 * The single entrypoint for the entire REST API.
 *
 * Every /api/v1/* request — all 141 endpoints across 22 Nest controllers —
 * lands here and is handed to the Nest application. Keeping it to one function
 * (rather than one per route) means a warm instance serves the whole API, not
 * just the endpoint that happened to warm it.
 */
import { handle } from '@/server/nest-handler';

// Nest needs the Node runtime: it uses reflection, Express, and Prisma's
// native engine, none of which exist on the Edge runtime.
export const runtime = 'nodejs';

// The API is request-dependent by definition; never statically optimise it.
export const dynamic = 'force-dynamic';

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
};
