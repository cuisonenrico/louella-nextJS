/**
 * Reading and resolving landing content — plain functions over a Prisma
 * client, shared by `LandingService` (the API) and the public page's server
 * render (which does not boot Nest just to draw a marketing page).
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { buildDefaultContent } from '@/lib/landing/defaults';
import { resolveWithCatalog } from '@/lib/landing/resolve';
import { landingContentSchema, type LandingContent, type ResolvedLanding } from '@/lib/landing/schema';
import { num } from '../common/utils/decimal.util';

type Db = Pick<PrismaClient, 'product' | 'branch'>;

/** Parses stored JSON; null when absent or no longer valid. */
export function parseContent(value: Prisma.JsonValue | null | undefined): LandingContent | null {
  if (value == null) return null;
  const parsed = landingContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Default content with featured breads/branches picked from the live catalog. */
export async function defaultContent(db: Db): Promise<LandingContent> {
  const [products, branches] = await Promise.all([
    db.product.findMany({
      where: { deletedAt: null, isActive: true, type: 'BREAD' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: 3,
    }),
    db.branch.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true },
      take: 6,
    }),
  ]);
  return buildDefaultContent(products.map((p) => p.id), branches.map((b) => b.id));
}

/** Merges live product names/prices and branch addresses into the content. */
export async function resolveContent(db: Db, content: LandingContent): Promise<ResolvedLanding> {
  const productIds = new Set<number>();
  const branchIds = new Set<number>();
  for (const s of content.sections) {
    if (s.type === 'products') s.items.forEach((i) => productIds.add(i.productId));
    if (s.type === 'branches') s.items.forEach((i) => branchIds.add(i.branchId));
  }

  const [products, branches] = await Promise.all([
    productIds.size
      ? db.product.findMany({
          where: { id: { in: [...productIds] }, deletedAt: null, isActive: true },
          select: { id: true, name: true, price: true },
        })
      : [],
    branchIds.size
      ? db.branch.findMany({
          where: { id: { in: [...branchIds] }, deletedAt: null, isActive: true },
          select: { id: true, name: true, address: true, phone: true },
        })
      : [],
  ]);

  return resolveWithCatalog(
    content,
    new Map(products.map((p) => [p.id, { id: p.id, name: p.name, price: num(p.price) }])),
    new Map(branches.map((b) => [b.id, b])),
  );
}

/** What the public page renders: published content, else defaults. */
export async function readPublishedLanding(
  db: Db & Pick<PrismaClient, 'landingPage'>,
): Promise<ResolvedLanding> {
  const row = await db.landingPage.findUnique({ where: { id: 1 }, select: { published: true } });
  const content = parseContent(row?.published) ?? (await defaultContent(db));
  return resolveContent(db, content);
}
