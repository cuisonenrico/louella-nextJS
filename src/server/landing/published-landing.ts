/**
 * The public page's data source.
 *
 * Reads through a plain PrismaClient instead of booting Nest — the page needs
 * two small queries, not the whole API. Cached under the `landing` tag, which
 * `LandingService.publish()` revalidates; the 5-minute window picks up
 * catalog changes (a new price, a renamed branch) without a publish.
 */
import { PrismaClient } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { buildDefaultContent } from '@/lib/landing/defaults';
import type { ResolvedLanding, ResolvedSection } from '@/lib/landing/schema';
import { readPublishedLanding } from './landing-content';

export const LANDING_REVALIDATE_SECONDS = 300;

const globalForPrisma = globalThis as unknown as { landingPrisma?: PrismaClient };
function db(): PrismaClient {
  globalForPrisma.landingPrisma ??= new PrismaClient();
  return globalForPrisma.landingPrisma;
}

const cachedPublished = unstable_cache(
  () => readPublishedLanding(db()),
  ['landing-published'],
  { tags: ['landing'], revalidate: LANDING_REVALIDATE_SECONDS },
);

/**
 * Copy-only defaults for when the database is unreachable. Catalog-backed
 * sections are dropped because there is nothing to fill them with.
 */
function offlineFallback(): ResolvedLanding {
  const content = buildDefaultContent();
  const sections = content.sections.filter(
    (s): s is Exclude<ResolvedSection, { type: 'products' | 'branches' }> =>
      s.type !== 'products' && s.type !== 'branches',
  );
  return { ...content, sections };
}

/** Never throws: a marketing page must render even when the DB does not. */
export async function getPublishedLanding(): Promise<ResolvedLanding> {
  try {
    return await cachedPublished();
  } catch (err) {
    console.error('[landing] falling back to default content:', err);
    return offlineFallback();
  }
}
