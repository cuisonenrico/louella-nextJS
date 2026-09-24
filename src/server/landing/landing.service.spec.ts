import { BadRequestException, ConflictException } from '@nestjs/common';
import { buildDefaultContent } from '@/lib/landing/defaults';
import { LandingService } from './landing.service';
import { LandingStorage } from './landing-storage';

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { revalidateTag } = require('next/cache') as { revalidateTag: jest.Mock };

const SUPABASE = 'https://proj.supabase.co';
const PREFIX = `${SUPABASE}/storage/v1/object/public/landing/`;
const SAVED_AT = new Date('2026-09-24T01:00:00Z');

function fakeDb(row: Record<string, unknown> | null = null) {
  const stored = row && { draftUpdatedAt: SAVED_AT, published: null, publishedById: null, ...row };
  const db = {
    landingPage: {
      findUnique: jest.fn().mockResolvedValue(stored),
      upsert: jest.fn().mockImplementation(({ create }) => ({ draftUpdatedAt: SAVED_AT, published: null, ...create })),
      update: jest.fn().mockImplementation(({ data }) => ({ draftUpdatedAt: data.draftUpdatedAt ?? SAVED_AT })),
    },
    landingRevision: {
      create: jest.fn().mockReturnValue('revision'),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    product: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
    branch: { findMany: jest.fn().mockResolvedValue([{ id: 7 }]) },
    user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return db;
}

function service(db: ReturnType<typeof fakeDb>) {
  return new LandingService(db as never, new LandingStorage());
}

describe('LandingService', () => {
  const env = process.env.SUPABASE_URL;
  beforeEach(() => {
    process.env.SUPABASE_URL = SUPABASE;
    revalidateTag.mockClear();
  });
  afterAll(() => {
    process.env.SUPABASE_URL = env;
  });

  it('creates the draft from defaults on first open, picking from the live catalog', async () => {
    const db = fakeDb(null);
    const result = await service(db).getDraft();
    const created = db.landingPage.upsert.mock.calls[0][0].create;
    expect(created.id).toBe(1);
    const breads = result.draft.sections.find((s) => s.type === 'products');
    expect(breads?.type === 'products' && breads.items.map((i) => i.productId)).toEqual([1]);
  });

  it('rejects content that fails the schema', async () => {
    const db = fakeDb({ draft: buildDefaultContent() });
    const bad = { ...buildDefaultContent(), brand: { ...buildDefaultContent().brand, name: '' } };
    await expect(service(db).saveDraft(bad, undefined, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(db.landingPage.update).not.toHaveBeenCalled();
  });

  it('only accepts images from our own bucket', async () => {
    const db = fakeDb({ draft: buildDefaultContent() });
    const content = buildDefaultContent();
    const hero = content.sections.find((s) => s.type === 'hero')!;
    if (hero.type !== 'hero') throw new Error('no hero');

    hero.image = { url: 'https://evil.example/x.jpg', alt: 'x', path: '' };
    await expect(service(db).saveDraft(content, undefined, 1)).rejects.toThrow('uploaded through the editor');

    hero.image = { url: `${PREFIX}2026-09-24/a.jpg`, alt: 'Bread', path: '2026-09-24/a.jpg' };
    await expect(service(db).saveDraft(content, undefined, 1)).resolves.toBeDefined();
  });

  it('refuses a save based on a stale copy of the draft', async () => {
    const db = fakeDb({ draft: buildDefaultContent() });
    await expect(
      service(db).saveDraft(buildDefaultContent(), '2026-09-23T00:00:00.000Z', 1),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(db).saveDraft(buildDefaultContent(), SAVED_AT.toISOString(), 1),
    ).resolves.toBeDefined();
  });

  it('publishes the draft, records a revision and clears the page cache', async () => {
    const draft = buildDefaultContent([1], [7]);
    const db = fakeDb({ draft });
    await service(db).publish(5);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.landingPage.update.mock.calls[0][0].data).toMatchObject({ published: draft, publishedById: 5 });
    expect(db.landingRevision.create.mock.calls[0][0].data).toMatchObject({ content: draft, publishedById: 5 });
    expect(revalidateTag).toHaveBeenCalledWith('landing', { expire: 0 });
  });

  it('restores a revision into the draft without publishing it', async () => {
    const old = buildDefaultContent();
    old.brand.name = 'Old Louella';
    const db = fakeDb({ draft: buildDefaultContent() });
    db.landingRevision.findUnique.mockResolvedValue({ id: 3, content: old });
    await service(db).restoreRevision(3, 1);
    const data = db.landingPage.update.mock.calls[0][0].data;
    expect(data.draft.brand.name).toBe('Old Louella');
    expect(data).not.toHaveProperty('published');
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
