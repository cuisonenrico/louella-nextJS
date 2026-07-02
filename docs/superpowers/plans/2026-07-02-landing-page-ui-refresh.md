# Landing Page + Warm-Artisanal UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public landing page at `/` showcasing Louella's real products, plus an app-wide warm-artisanal theme refresh (Fraunces + Inter, flour/ink/crust/ube palette).

**Architecture:** `/` becomes a statically-rendered server component with one small client island (auth-aware CTA button). The theme refresh flows through shadcn CSS tokens in `globals.css` and `next/font` variables in the root layout; the shell (sidebar, header, login) is restyled by hand. No backend changes.

**Tech Stack:** Next.js 16 (App Router), Tailwind 4 (`@theme inline` tokens), shadcn/ui, next/font (Google: Fraunces, Inter).

## Global Constraints

- `louella-web` only; **no backend changes** (spec).
- Landing content is **static and curated** — no API calls on `/` (spec).
- Product names must be real catalog items (from `louella-be/prisma/seed-products.sql`); **no prices** shown (they drift).
- Do not invent facts: no founding year, no city, no opening hours with fake precision.
- Respect `prefers-reduced-motion` for any animation.
- Verification is `npm run build` + `npm run lint` + Playwright visual pass (no RTL in this repo; do not add test deps for this work).

## Design tokens (locked)

| Token | Value | Name |
|---|---|---|
| `--background` | `36 56% 96%` (≈ #FAF4EA) | flour |
| `--foreground` | `22 48% 12%` (≈ #2D1B0E) | ink |
| `--primary` | `26 92% 51%` (≈ #F4780B) | crust (tuned brand orange) |
| `--secondary` | `267 43% 44%` (#6B3FA0, unchanged) | ube |
| `--accent` | `39 77% 90%` (≈ #F8EACB) | butter |
| Display font | Fraunces (var `--font-fraunces`, utility `font-display`) | |
| Body font | Inter (var `--font-inter`, utility `font-sans`) | |

**Signature elements:** (1) landing showcase structured as the panaderya's real daily rhythm — *Before dawn / Merienda / For the table*; (2) a slow marquee "display case" band of real product names; (3) app sidebar goes deep-brown "oven" surface with crust-orange active pill.

---

### Task 1: Fonts + theme tokens

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: CSS vars `--font-fraunces`, `--font-inter`; Tailwind utilities `font-display`, `font-sans`; refreshed shadcn tokens. All later tasks rely on `font-display` existing.

- [ ] **Step 1: Load fonts in root layout**

Replace `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Louella Bakery",
  description:
    "Neighborhood panaderya — pandesal at dawn, merienda breads in the afternoon, cakes for the table.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Refresh tokens in globals.css**

In `src/app/globals.css`:

(a) Inside the `@theme inline` block, add after the radius lines:

```css
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-fraunces), Georgia, "Times New Roman", serif;
```

(b) Replace the `:root` token values with:

```css
:root {
  --background: 36 56% 96%;         /* flour       */
  --foreground: 22 48% 12%;         /* ink (brown) */
  --card: 40 60% 99%;
  --card-foreground: 22 48% 12%;
  --popover: 40 60% 99%;
  --popover-foreground: 22 48% 12%;
  --primary: 26 92% 51%;            /* crust       */
  --primary-foreground: 0 0% 100%;
  --secondary: 267 43% 44%;         /* ube         */
  --secondary-foreground: 0 0% 100%;
  --muted: 36 33% 91%;
  --muted-foreground: 25 18% 40%;
  --accent: 39 77% 90%;             /* butter      */
  --accent-foreground: 26 60% 28%;
  --destructive: 0 72% 45%;
  --destructive-foreground: 0 0% 100%;
  --success: 120 40% 34%;
  --success-foreground: 0 0% 100%;
  --warning: 25 95% 47%;
  --warning-foreground: 0 0% 100%;
  --border: 33 30% 85%;
  --input: 33 30% 85%;
  --ring: 26 92% 51%;
  --radius: 0.625rem;               /* 10px global radius */
}
```

(c) Replace the `body` rule's `font-family` line with:

```css
  font-family: var(--font-sans);
```

(d) Append at the end of the file:

```css
/* ── Display typography ──────────────────────────────────────────────────── */
h1,
h2,
h3 {
  font-family: var(--font-display);
  letter-spacing: -0.01em;
}

/* ── Landing marquee ─────────────────────────────────────────────────────── */
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}

.animate-marquee {
  animation: marquee 45s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .animate-marquee {
    animation: none;
  }
}
```

- [ ] **Step 3: Verify build**

Run in `louella-web/`: `npm run build`
Expected: compiles successfully (fonts are fetched at build time).

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(web): warm-artisanal theme tokens + Fraunces/Inter via next/font"
```

---

### Task 2: Landing page at `/`

**Files:**
- Create: `src/components/landing/LandingCta.tsx`
- Modify: `src/app/page.tsx` (replaces the `redirect("/dashboard")`)

**Interfaces:**
- Consumes: `useAuth()` from `@/contexts/AuthContext` (`isAuthenticated: boolean`, `isLoading: boolean`); `font-display` utility from Task 1.
- Produces: public route `/`; `<LandingCta />` client component (no props).

- [ ] **Step 1: Auth-aware CTA (client island)**

Create `src/components/landing/LandingCta.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

/** Top-right nav button: Login for guests, Dashboard when a session exists. */
export default function LandingCta() {
  const { isAuthenticated, isLoading } = useAuth();
  const authed = !isLoading && isAuthenticated;

  return (
    <Button asChild size="sm" className="rounded-full px-5">
      <Link href={authed ? '/dashboard' : '/login'}>
        {authed ? 'Dashboard' : 'Login'}
      </Link>
    </Button>
  );
}
```

- [ ] **Step 2: Landing page**

Replace `src/app/page.tsx` with the full page below. Content notes: product names are real catalog items; the three showcase groups encode the bakery's actual daily rhythm; no prices, no invented facts.

```tsx
import Link from 'next/link';
import LandingCta from '@/components/landing/LandingCta';

const displayCase = [
  'Pandesal', 'Spanish Bread', 'Ensaymada', 'Pandecoco', 'Putok',
  'Sweet Monay', 'Cinnamon Round', 'Egg Pie', 'Hopia', 'Kababayan',
  'Ube Rolls', 'Mocha Rolls', 'Special Mamon', 'Brownies', 'Banana Loaf',
  'Crinkles',
];

const bakeGroups = [
  {
    time: 'Before dawn',
    blurb: 'The first trays out of the oven are the breakfast breads.',
    items: [
      { name: 'Pandesal', note: 'Hot, pillowy, best by the dozen.' },
      { name: 'Putok', note: 'Dense and sweet with a sugared crown.' },
      { name: 'Sweet Monay', note: 'Soft, rich, and a little chewy.' },
      { name: 'Tasty Loaf', note: 'Sliced white bread for the toaster.' },
    ],
  },
  {
    time: 'Merienda',
    blurb: 'Afternoon breads for coffee, chismis, and the ride home.',
    items: [
      { name: 'Spanish Bread', note: 'Rolled around a buttery filling.' },
      { name: 'Ensaymada', note: 'Soft brioche, sugar and cheese on top.' },
      { name: 'Pandecoco', note: 'A sweet coconut heart inside.' },
      { name: 'Egg Pie', note: 'Silky custard with a burnished top.' },
    ],
  },
  {
    time: 'For the table',
    blurb: 'Rolls and cakes for birthdays, fiestas, and Sunday visits.',
    items: [
      { name: 'Ube Rolls', note: 'Chiffon rolled with real ube.' },
      { name: 'Mocha Cake', note: 'Coffee-kissed layers, round or square.' },
      { name: 'Special Mamon', note: 'Feather-light sponge cups.' },
      { name: 'Brownies', note: 'Dense, fudgy, cut generously.' },
    ],
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-2xl font-semibold italic tracking-tight">
            Louella
          </span>
          <span className="hidden text-xs uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            Panaderya
          </span>
        </div>
        <LandingCta />
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-14 sm:pt-24">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
          Baked fresh, every day
        </p>
        <h1 className="max-w-3xl font-display text-5xl font-medium leading-[1.05] tracking-tight sm:text-7xl">
          The ovens are on <em className="text-primary">before the sun is up.</em>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Louella is a neighborhood bakery. Pandesal at dawn, merienda breads in
          the afternoon, and cakes for the table on the days that matter.
        </p>
        <div className="mt-8">
          <Link
            href="#todays-bake"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/85"
          >
            See the day&apos;s bake
            <span aria-hidden>↓</span>
          </Link>
        </div>
      </section>

      {/* Display-case band */}
      <div className="overflow-hidden border-y bg-accent/60 py-3" aria-hidden>
        <div className="flex w-max animate-marquee gap-0">
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center">
              {displayCase.map((name) => (
                <li
                  key={`${copy}-${name}`}
                  className="flex items-center whitespace-nowrap px-4 font-display text-sm italic text-accent-foreground"
                >
                  {name}
                  <span className="ml-8 text-primary">·</span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* The day's bake */}
      <section id="todays-bake" className="mx-auto max-w-6xl scroll-mt-10 px-6 py-20">
        <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
          The day&apos;s bake
        </h2>
        <p className="mt-3 max-w-lg text-muted-foreground">
          A panaderya runs on rhythm. Here is ours, from the first trays to the
          last box tied with string.
        </p>

        <div className="mt-12 space-y-16">
          {bakeGroups.map((group) => (
            <div key={group.time} className="grid gap-6 md:grid-cols-[220px_1fr]">
              <div>
                <h3 className="font-display text-xl font-medium italic text-primary">
                  {group.time}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {group.blurb}
                </p>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li
                    key={item.name}
                    className="rounded-xl border bg-card p-5 shadow-[0_1px_0_hsl(var(--border))]"
                  >
                    <p className="font-display text-lg font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.note}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-xl font-medium italic">Louella</p>
            <p className="mt-1 text-sm text-background/70">
              Baked fresh, every day.
            </p>
          </div>
          <Link
            href="/login"
            className="text-sm text-background/70 underline-offset-4 transition-colors hover:text-background hover:underline"
          >
            Staff login
          </Link>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: `/` is rendered as a static route (○) in the route summary.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/landing/LandingCta.tsx
git commit -m "feat(web): public landing page showcasing the day's bake"
```

---

### Task 3: Login page restyle

**Files:**
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `font-display` utility (Task 1). Form logic (state, `login`, redirect on auth) is kept exactly as-is.

- [ ] **Step 1: Restyle the JSX**

Keep everything from the top of the file through `handleSubmit` unchanged. Replace the returned JSX with:

```tsx
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-sm md:grid md:grid-cols-[1.1fr_1fr]">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-foreground p-10 text-background md:flex">
          <p className="font-display text-2xl font-semibold italic">Louella</p>
          <div>
            <p className="font-display text-3xl font-medium leading-snug">
              The ovens are on before the sun is up.
            </p>
            <p className="mt-4 text-sm text-background/60">
              Inventory, production, and sales for the panaderya.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm text-background/60 underline-offset-4 transition-colors hover:text-background hover:underline"
          >
            ← Back to louellabakery
          </Link>
        </div>

        {/* Form panel */}
        <div className="p-8 sm:p-10">
          <h1 className="font-display text-2xl font-medium">Sign in</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">
            Staff access to the bakery workspace.
          </p>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                placeholder="admin@louella.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign In'}
            </Button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            Contact your administrator to create an account.
          </p>
          <Link
            href="/"
            className="mt-2 inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:hidden"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
```

Also update imports: add `import Link from 'next/link';`, and remove the now-unused `Card, CardContent` import.

- [ ] **Step 2: Verify build**

Run: `npm run build` — expected: success, no unused-import lint errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(web): login page restyled as extension of landing"
```

---

### Task 4: Shell restyle (sidebar + header)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `font-display` utility (Task 1). `DRAWER_WIDTH`/`COLLAPSED_WIDTH` exports unchanged.

- [ ] **Step 1: Sidebar — oven-brown surface, crust active pill, serif wordmark**

In `src/components/layout/Sidebar.tsx`:

(a) Replace the `<aside>` inline gradient:

```tsx
        background: 'linear-gradient(180deg, #33200F 0%, #241407 100%)',
```

(b) In `renderItem`, replace the active classes (both occurrences — `renderItem` and the config-section copy):

```tsx
            active
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
```

and the icon class line in both places:

```tsx
          <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-primary-foreground' : 'text-white/60')} />
```

(c) Replace the expanded wordmark block:

```tsx
            <div>
              <h1 className="font-display text-xl font-semibold italic leading-tight text-white">Louella</h1>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">Panaderya</span>
            </div>
```

- [ ] **Step 2: Header — display type for page titles, warmer chrome**

In `src/components/layout/Header.tsx`, replace the title line:

```tsx
      {title && <h2 className="font-display text-xl font-semibold tracking-tight shrink-0">{title}</h2>}
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build; npm run lint` — expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Header.tsx
git commit -m "feat(web): oven-brown sidebar + display-type header"
```

---

### Task 5: Verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full checks**

Run in `louella-web/`: `npm run build; npm run lint; npm run test`
Expected: all pass (vitest covers existing hook specs).

- [ ] **Step 2: Visual pass with Playwright**

Start dev server on a free port (BE may own 3000/3001): `npx next dev -p 4100`. Then with Playwright browser tools:
- `http://localhost:4100/` — landing renders; wordmark left, **Login** button top right; marquee band visible; three bake groups; footer staff-login link.
- `http://localhost:4100/login` — split card, serif heading, back-to-home link, no emoji.
- Dashboard/shell: only verify logged-in chrome if the configured API (`.env.local`) is the **local** backend; do not log into production for a visual check. If prod is configured, verify shell styling via component review + build only, and note it.
- Check `prefers-reduced-motion` stops the marquee (Playwright `emulateMedia`).

**Expected:** screenshots confirm the warm-artisanal direction; no layout breakage.

- [ ] **Step 3: Final commit (if fixes were needed) and report**

---

## Self-review notes

- **Spec coverage:** landing (nav/hero/showcase/footer, auth-aware button) → Task 2; theme tokens + fonts → Task 1; login restyle → Task 3; sidebar/header → Task 4; verification → Task 5. Backend untouched. ✓
- **Placeholders:** none — all steps carry full code. ✓
- **Type consistency:** `LandingCta` (no props) used only in Task 2; `font-display` utility defined in Task 1 and consumed in Tasks 2–4. ✓
