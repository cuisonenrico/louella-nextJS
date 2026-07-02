# Landing Page + Warm-Artisanal UI Refresh — Design

**Date:** 2026-07-02
**Status:** Approved
**Scope:** `louella-web` only. No backend changes.

## Goal

1. The base URL (`/`) becomes a public landing page that showcases the bakery's
   products — simple, direct, with a Login button at the top right.
2. The overall UI of the existing app gets a theme-level refresh so it stops
   looking like a generic shadcn/Inter template.

## Decisions (confirmed with owner)

- **Content:** curated static showcase. The DB has no product images and no
  public endpoints, so the landing page ships hand-crafted content for the real
  product families (Breads, Cakes, Specials). No API calls, no backend work.
- **Aesthetic:** warm artisanal — cream/flour tones, deep brown ink, existing
  orange as accent, serif display font (Fraunces) paired with Inter.
- **Polish depth:** theme-level refresh via shadcn tokens + shared shell
  components (sidebar, header, login). No per-page redesigns.

## Architecture

### 1. Landing page (`src/app/page.tsx`)

Replace the current `redirect("/dashboard")` with a public, statically-rendered
page. No auth wrapper (route guarding is per-page, so nothing else changes).

Sections, top to bottom:

- **Top nav** — "Louella" wordmark (Fraunces) left; right side shows a single
  button: **Login** (`/login`) for guests, **Dashboard** (`/dashboard`) when a
  session exists. The auth-aware button is a small client component; the rest
  of the page stays server-rendered.
- **Hero** — large serif headline + short sub-line + anchor link to the
  showcase. Warm cream backdrop with a subtle decorative CSS/SVG texture. No
  stock photos (none exist in the system).
- **Product showcase** — curated grid of product families and signature items,
  each a warm card: soft illustrated/gradient visual, name, one-line
  description. Static content.
- **Footer** — bakery name, short line, quiet "Staff login" link.

### 2. Theme refresh (`globals.css`, `layout.tsx`)

- Load **Fraunces** + **Inter** via `next/font` in the root layout, exposed as
  CSS variables (`--font-display`, `--font-sans`).
- Refine shadcn tokens: creamier background, deeper brown ink, tuned
  orange/purple pairing, warmer borders/muted tones.
- Base-layer rule applies the display font to headings app-wide.

### 3. Shell restyle

- **Sidebar** — warmer surface, refined active-item treatment, wordmark
  matching the landing page.
- **Header** — matching typography, softened chrome.
- **Login page** — redesigned as an extension of the landing page (framed
  layout, serif heading, no emoji), with a "back to home" link.

Feature pages, tables, and the sheet module are untouched — they inherit the
token/typography refresh.

## Error handling

No new data flows, so no new error surfaces. The auth-aware nav button reads
the existing `AuthContext`; while auth state is loading it renders the Login
variant (safe default for a public page).

## Testing / verification

- `npm run build` and `npm run lint` must pass.
- Playwright visual pass over `/`, `/login`, and `/dashboard` (logged in) to
  confirm rendering, the top-right button behavior, and that existing screens
  still look correct with the new tokens.

## Out of scope

- Backend changes of any kind.
- Public product API or product images.
- Per-page redesigns of feature screens.
