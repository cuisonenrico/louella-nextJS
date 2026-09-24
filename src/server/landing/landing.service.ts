import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { landingContentSchema, type LandingContent } from '@/lib/landing/schema';
import { PrismaService } from '../prisma/prisma.service';
import { defaultContent, parseContent, readPublishedLanding } from './landing-content';
import { LandingStorage } from './landing-storage';

/** Cache tag for the public page's `unstable_cache` entry. */
export const LANDING_CACHE_TAG = 'landing';

@Injectable()
export class LandingService {
  private readonly logger = new Logger(LandingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LandingStorage,
  ) {}

  getPublished() {
    return readPublishedLanding(this.prisma);
  }

  /** The draft, created from defaults (or the published page) on first open. */
  private async row() {
    const existing = await this.prisma.landingPage.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    const draft = await defaultContent(this.prisma);
    return this.prisma.landingPage.upsert({
      where: { id: 1 },
      create: { id: 1, draft: draft as Prisma.InputJsonValue },
      update: {},
    });
  }

  async getDraft() {
    const row = await this.row();
    // A draft that no longer parses (schema moved on) falls back to the
    // published page, then defaults, rather than locking the editor.
    const draft =
      parseContent(row.draft) ?? parseContent(row.published) ?? (await defaultContent(this.prisma));
    const [products, branches, publishedBy] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, price: true, isActive: true, type: true },
      }),
      this.prisma.branch.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, address: true, phone: true, isActive: true },
      }),
      row.publishedById
        ? this.prisma.user.findUnique({ where: { id: row.publishedById }, select: { email: true } })
        : null,
    ]);
    return {
      draft,
      draftUpdatedAt: row.draftUpdatedAt,
      publishedAt: row.publishedAt,
      publishedBy: publishedBy?.email ?? null,
      hasUnpublishedChanges: JSON.stringify(row.draft) !== JSON.stringify(row.published),
      options: { products, branches },
    };
  }

  /**
   * Validates and stores the draft. `baseUpdatedAt` is the draftUpdatedAt the
   * editor loaded; a mismatch means another admin saved in between, so the
   * save is refused rather than silently overwriting their work.
   */
  async saveDraft(input: unknown, baseUpdatedAt: string | undefined, userId: number) {
    const content = this.validate(input);
    const row = await this.row();
    if (baseUpdatedAt && new Date(baseUpdatedAt).getTime() !== row.draftUpdatedAt.getTime()) {
      throw new ConflictException('Someone else saved the landing page since you opened it. Reload to see their changes.');
    }
    const updated = await this.prisma.landingPage.update({
      where: { id: 1 },
      data: { draft: content as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedById: userId },
      select: { draftUpdatedAt: true },
    });
    return { draftUpdatedAt: updated.draftUpdatedAt };
  }

  async publish(userId: number) {
    const row = await this.row();
    const content = this.validate(row.draft);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.landingPage.update({
        where: { id: 1 },
        data: { published: content as Prisma.InputJsonValue, publishedAt: now, publishedById: userId },
      }),
      this.prisma.landingRevision.create({
        data: { content: content as Prisma.InputJsonValue, publishedAt: now, publishedById: userId },
      }),
    ]);
    this.revalidate();
    return { publishedAt: now };
  }

  /** Throws away unpublished edits: the draft becomes the published page again. */
  async discardDraft(userId: number) {
    const row = await this.row();
    const published = parseContent(row.published);
    if (!published) throw new BadRequestException('Nothing has been published yet.');
    const updated = await this.prisma.landingPage.update({
      where: { id: 1 },
      data: { draft: published as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedById: userId },
      select: { draftUpdatedAt: true },
    });
    return updated;
  }

  async listRevisions() {
    const revisions = await this.prisma.landingRevision.findMany({
      orderBy: { publishedAt: 'desc' },
      take: 50,
      select: { id: true, publishedAt: true, publishedById: true },
    });
    const userIds = [...new Set(revisions.map((r) => r.publishedById).filter((id): id is number => id != null))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.email]));
    return revisions.map((r) => ({
      id: r.id,
      publishedAt: r.publishedAt,
      publishedBy: r.publishedById ? (nameById.get(r.publishedById) ?? null) : null,
    }));
  }

  /** Loads a past revision into the draft. Does not publish it. */
  async restoreRevision(id: number, userId: number) {
    const revision = await this.prisma.landingRevision.findUnique({ where: { id } });
    if (!revision) throw new NotFoundException('Revision not found');
    const content = parseContent(revision.content);
    if (!content) throw new BadRequestException('That revision can no longer be restored.');
    await this.row();
    return this.prisma.landingPage.update({
      where: { id: 1 },
      data: { draft: content as Prisma.InputJsonValue, draftUpdatedAt: new Date(), draftUpdatedById: userId },
      select: { draftUpdatedAt: true },
    });
  }

  createUploadUrl(contentType: string, size: number) {
    return this.storage.createUploadUrl(contentType, size);
  }

  private validate(input: unknown): LandingContent {
    const parsed = landingContentSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue.path.join('.');
      throw new BadRequestException(`Invalid landing content${where ? ` at ${where}` : ''}: ${issue.message}`);
    }
    this.assertImageUrls(parsed.data);
    return parsed.data;
  }

  /**
   * Images must come from our own bucket (or the bundled /assets folder), so
   * the public page never hot-links a third-party URL an admin pasted in.
   */
  private assertImageUrls(content: LandingContent) {
    const prefix = this.storage.publicPrefix();
    const allowed = (url: string) => url.startsWith('/assets/') || (prefix != null && url.startsWith(prefix));
    const urls: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        if (typeof o.url === 'string' && typeof o.alt === 'string' && 'path' in o) urls.push(o.url);
        else Object.values(o).forEach(walk);
      }
    };
    walk(content);
    const bad = urls.find((u) => !allowed(u));
    if (bad) throw new BadRequestException('Images must be uploaded through the editor.');
  }

  private revalidate() {
    try {
      revalidateTag(LANDING_CACHE_TAG, { expire: 0 });
    } catch (err) {
      // Outside a Next request (tests, scripts) there is no cache to clear;
      // the page's 5-minute revalidate still picks the change up.
      this.logger.warn(`revalidateTag skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
