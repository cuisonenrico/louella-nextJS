# Landing page CMS — design

**Status:** implemented · 2026-09-24

## Goal

The public landing page (`/`) is rebuilt in the warm panaderia style of the
approved mockup, and **every element is editable by an admin** from the
dashboard (Settings → Landing Page) without code changes: copy, links, images,
section order and visibility, featured breads and branch cards.

## Decisions

| Question | Decision |
|---|---|
| Featured breads / branches | **Linked** to real `Product` / `Branch` rows. Name, price and address come live from the catalog; the landing page adds marketing extras (photo, badge, description, tags, bake times, hours…). Price shows as `₱45.00 / <unit>` with an editable unit. |
| Image storage | **Supabase Storage**, public bucket `landing`, signed direct uploads (JPG/PNG/WebP ≤ 8 MB). |
| Editing model | Section editor with live preview; **draft → publish**; publish history with restore. |
| Newsletter | Dropped. |
| Storage shape | One JSON document validated by a shared Zod schema (vs. relational tables). |

## Sections

`hero`, `products` (featured breads), `about`, `branches`, `cta`, `footer`, plus
the `brand` block (name, logo, nav links, header button, SEO title/description).
Sections can be reordered, hidden, removed and added (including duplicates,
e.g. a second products section for cakes). Each has an optional anchor for nav
links. Feature icons come from a curated lucide list.

## Data

- `LandingPage` — singleton (`id = 1`, CHECK constraint): `draft`, `published`,
  timestamps and user ids.
- `LandingRevision` — append-only copy of every publish.
- Content schema: `src/lib/landing/schema.ts`. Defaults: `src/lib/landing/defaults.ts`
  (featured breads/branches auto-picked from the catalog on first open).

## API (`src/server/landing`)

| Method | Path | Access |
|---|---|---|
| GET | `/landing` | public — resolved published content |
| GET / PUT | `/landing/admin/draft` | ADMIN + `landing` — PUT refuses a stale `baseUpdatedAt` (409) |
| POST | `/landing/admin/draft/discard` | draft ← published |
| POST | `/landing/admin/publish` | draft → published + revision, revalidates tag `landing` |
| GET | `/landing/admin/revisions` | last 50 |
| POST | `/landing/admin/revisions/:id/restore` | revision → draft (does not publish) |
| POST | `/landing/admin/images/upload-url` | signed Supabase upload URL |

Saved content is rejected unless every image URL is in our bucket (or
`/assets/`), and every link is a path, anchor, http(s), mailto or tel.

## Rendering

- `src/app/page.tsx` (server component, `revalidate = 300`) →
  `getPublishedLanding()` (plain PrismaClient + `unstable_cache`, tag `landing`).
  Falls back to default copy when the DB is unreachable or content is invalid.
- `LandingRenderer` + section components (`src/components/landing/site`) are
  props-only; the editor preview renders the same components over the unsaved
  draft, resolved client-side with the catalog returned by the draft endpoint.
- Landing-only fonts (EB Garamond, Plus Jakarta Sans) and `lp-*` color tokens.

## Out of scope

Editable colors/fonts, scheduled publishing, per-section free-form layouts,
instant revalidation on product/branch edits (5-minute window instead).
