# Mobile-Responsive Web App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to work this task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Louella web app usable on a phone for reading and light
editing, without pretending twelve-column grid entry works at 390px.

**Spec:** `docs/superpowers/specs/2026-09-02-mobile-responsive-design.md` —
read its **Audit** and **RBAC integration** sections before Task 1. The finding
IDs (F1–F10) below refer to it.

**Architecture:** Fix the shared primitives first, so every screen improves
before any screen is touched. Then delete the pixel contract that couples
`Sidebar`, `Header` and `main` in `(app)/layout.tsx` and replace it with an
ordinary flex layout — the aside is `hidden md:flex`, and below `md` the same
content renders in a `Sheet`. That is a pure CSS breakpoint, because the
drawer's content only mounts when open. JS breakpoint detection is used for
exactly one thing: swapping `Dialog` for a bottom `Sheet`, where the two are
genuinely different components.

**Tech stack:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui
(hand-vendored — no `components.json`), Radix primitives, Vitest + Testing
Library. **No new runtime dependencies.**

---

## Global constraints

- **Package manager is npm.** No `packageManager` field; use `npm` / `npx`.
- **Run every command from `louella-web/`,** not the workspace root. Vitest from
  the root picks up a different config and fails with `describe is not defined`.
  The Bash tool resets its working directory between calls — use absolute paths
  or re-`cd` each time.
- **The shell breakpoint is `md` (768px).** One breakpoint for the whole shell.
  Do not introduce a second.
- **`Sidebar`'s props must stay `{ collapsed: boolean; onToggle: () => void }`.**
  `Sidebar.spec.tsx` renders it directly; 12 tests depend on that signature.
- **Never change which nav items a role sees.** This refactor is layout only.
  `src/lib/rbac/features.ts`, `navigationFor` and `RouteGuard` are out of
  bounds. 12 Sidebar tests and 13 RouteGuard tests must pass **unedited** at
  every step — that is the proof.
- **No `space-x-*` / `space-y-*`** — use `flex` with `gap-*` (project shadcn
  rule). Existing violations in files you touch may be fixed; do not go hunting.
- **Use `size-*` when width and height are equal** — `size-4`, not `w-4 h-4`.
- **No manual `z-index` on overlay components.** Dialog and Sheet manage their
  own stacking.
- **Dialog and Sheet always need a title** — `DialogTitle` / `SheetTitle`, with
  `className="sr-only"` if visually hidden.
- **Two unrelated things are called "sheet".** `src/components/ui/sheet.tsx` is
  the Radix slide-out. `src/components/sheet/` is the spreadsheet module. In
  commits and comments, call the latter **the grid**.
- **Baseline to keep green (verified 2026-09-02):**
  `npx jest` → 588 passed, 27 suites. `npx vitest run` → 294 passed, 1 skipped,
  11 files. The skip is `matches feature_keys.dart exactly`; `louella_mobile` is
  not in this workspace.

---

## Task 1: `useIsMobile` hook

Needed only by Task 9's dialog swap, but built first so it is available and
independently tested.

**Files:**
- Create: `src/lib/useIsMobile.ts`
- Test: `src/lib/useIsMobile.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `MOBILE_BREAKPOINT_PX: 768`, `useIsMobile(): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/useIsMobile.spec.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_BREAKPOINT_PX, useIsMobile } from './useIsMobile';

/**
 * Drives a controllable matchMedia so the hook can be tested without a real
 * viewport. vitest.setup.ts installs a stub that always reports
 * `matches: false`; this replaces it per-test so both branches are exercised.
 */
function installMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches,
    media: '',
    onchange: null,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = ((query: string) => ({ ...mql, media: query })) as unknown as typeof window.matchMedia;
  return {
    emit(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => cb({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the shell breakpoint so CSS and JS cannot drift', () => {
    expect(MOBILE_BREAKPOINT_PX).toBe(768);
  });

  it('reports false on a wide viewport', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('reports true on a narrow viewport', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates when the viewport crosses the breakpoint', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.emit(true));
    expect(result.current).toBe(true);
  });

  it('queries strictly below the breakpoint, so md itself is desktop', () => {
    // Tailwind's `md:` applies at >= 768px. The hook must agree, or a viewport
    // at exactly 768 gets the desktop sidebar and the mobile dialog.
    const spy = vi.fn(() => ({
      matches: false, media: '', onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    window.matchMedia = spy as unknown as typeof window.matchMedia;
    renderHook(() => useIsMobile());
    expect(spy).toHaveBeenCalledWith('(max-width: 767px)');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

`npx vitest run src/lib/useIsMobile.spec.ts` → FAIL, `Failed to resolve import "./useIsMobile"`

- [ ] **Step 3: Implement**

`src/lib/useIsMobile.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

/**
 * The one shell breakpoint, matching Tailwind's `md`.
 *
 * Exported so the hook and the `md:` utility classes cannot drift apart. The
 * media query is `max-width: 767px` rather than `768px` because Tailwind's
 * `md:` applies at >= 768px — at exactly 768 a `768px` query would be true
 * while `md:` was also active, giving a viewport both the desktop sidebar and
 * the mobile dialog.
 */
export const MOBILE_BREAKPOINT_PX = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Whether the viewport is narrower than the shell breakpoint.
 *
 * Uses `useSyncExternalStore` so the server snapshot is explicitly `false` and
 * React reconciles it on hydration instead of warning about a mismatch.
 *
 * Prefer a `md:` utility class wherever CSS can do the job. Reach for this only
 * when mobile and desktop need genuinely different components — the
 * Dialog/Sheet swap is the one case in this app.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
```

- [ ] **Step 4: Verify it passes** — `npx vitest run src/lib/useIsMobile.spec.ts` → 5 passed
- [ ] **Step 5: Commit**

```bash
git add src/lib/useIsMobile.ts src/lib/useIsMobile.spec.ts
git commit -m "feat(responsive): add useIsMobile hook and shared breakpoint"
```

---

## Task 2: Viewport metadata and safe-area insets (F5)

`env(safe-area-inset-*)` evaluates to `0px` unless the viewport meta carries
`viewport-fit=cover`. Without this, Task 9's bottom sheet sits under an iPhone's
home indicator. Next injects `width=device-width, initial-scale=1` by default
but not `viewport-fit`.

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `export const viewport: Viewport` in the root layout; a
  `.pb-safe` utility class.

- [ ] **Step 1: Add the viewport export**

In `src/app/layout.tsx`, alongside the existing `metadata` export:

```ts
import type { Metadata, Viewport } from 'next';

/**
 * `viewport-fit=cover` is what makes `env(safe-area-inset-*)` resolve to real
 * numbers instead of 0. Without it a bottom sheet renders under the iPhone home
 * indicator. Width and initial-scale match Next's default; they are repeated
 * because declaring the export replaces the default rather than extending it.
 *
 * Deliberately no `maximumScale` / `userScalable: false`: suppressing zoom is
 * the usual "fix" for iOS input zoom and it breaks WCAG 1.4.4. The real fix is
 * a 16px input font (see ui/input.tsx).
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
```

- [ ] **Step 2: Add the safe-area utility**

`src/app/globals.css` is Tailwind v4 (`@import "tailwindcss"` + `@theme inline`,
103 lines, no `@layer` blocks), so use the v4 `@utility` directive rather than a
bare class — that registers it as a real utility, so variants like `md:pb-safe`
work and `cn()`'s tailwind-merge understands it:

```css
/* Bottom padding that clears the home indicator on notched devices and is a
   no-op everywhere else. Returns 0 unless the viewport carries
   viewport-fit=cover — see src/app/layout.tsx. */
@utility pb-safe {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npx vitest run
```
Expected: typecheck clean; 294 passed, 1 skipped. There is no unit test for a
meta tag — Task 11's browser walk is what confirms it renders.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(responsive): opt into viewport-fit=cover and add pb-safe"
```

---

## Task 3: 16px inputs on mobile (F1)

The highest-value single change. Every `Input`, `Textarea` and `SelectTrigger`
is `text-sm` (14px), and iOS Safari zooms the viewport whenever a sub-16px field
takes focus — then leaves it zoomed. This is every form in the app.

`text-base md:text-sm` keeps the desktop look byte-identical and gives phones
16px. `Input` also moves to `h-11` below `md` (44px, the touch-target standard)
since a 16px font in an `h-10` box is cramped.

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/select.tsx` (the `SelectTrigger` class only)
- Test: `src/components/ui/input.spec.tsx` (new)

**Interfaces:** no API change. Class strings only.

- [ ] **Step 1: Write the failing test**

`src/components/ui/input.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './input';
import { Textarea } from './textarea';

/**
 * iOS Safari zooms the viewport when a focused field's font-size is under 16px
 * and does not zoom back out. `text-base` is 16px; `md:text-sm` restores the
 * desktop size above the shell breakpoint. Asserted on the class string because
 * jsdom has no layout engine and cannot report a computed font size.
 */
describe('form controls avoid the iOS focus zoom', () => {
  it('renders inputs at 16px below md', () => {
    render(<Input aria-label="field" />);
    const cls = screen.getByLabelText('field').className;
    expect(cls).toContain('text-base');
    expect(cls).toContain('md:text-sm');
  });

  it('renders textareas at 16px below md', () => {
    render(<Textarea aria-label="notes" />);
    const cls = screen.getByLabelText('notes').className;
    expect(cls).toContain('text-base');
    expect(cls).toContain('md:text-sm');
  });

  it('gives inputs a 44px touch target below md', () => {
    render(<Input aria-label="field" />);
    const cls = screen.getByLabelText('field').className;
    expect(cls).toContain('h-11');
    expect(cls).toContain('md:h-10');
  });

  it('still lets a caller override the size', () => {
    render(<Input aria-label="field" className="h-8" />);
    // cn() runs tailwind-merge, so the later class must win outright rather
    // than both landing in the string and the cascade deciding.
    expect(screen.getByLabelText('field').className).not.toContain('h-11');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

`npx vitest run src/components/ui/input.spec.tsx` → FAIL on `text-base`.

- [ ] **Step 3: Implement**

`input.tsx` — replace `'flex h-10 w-full … text-sm ring-offset-background'` with
`'flex h-11 md:h-10 w-full … text-base md:text-sm ring-offset-background'`.
Leave `file:text-sm` alone; it styles the file-picker button, not the field.

`textarea.tsx` — `text-sm` → `text-base md:text-sm`.

`select.tsx:19` (`SelectTrigger`) — `h-10` → `h-11 md:h-10`, `text-sm` →
`text-base md:text-sm`. A `Select` does not itself trigger the zoom (it opens a
native-ish listbox), but a trigger two pixels shorter than the `Input` beside it
in a filter row is worse than the zoom.

Add one comment above the `Input` class string:

```tsx
// `text-base md:text-sm`: 16px is the threshold under which iOS Safari zooms
// the viewport on focus and does not restore it. `h-11` below md is the 44px
// touch target (WCAG 2.5.5 / Apple HIG); desktop keeps the h-10/14px look.
```

- [ ] **Step 4: Verify**

```bash
npx vitest run
```
Expected: 298 passed, 1 skipped (294 + 4 new). If any existing test asserts on
an input's class string, it will fail here — fix the assertion, not the class.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/textarea.tsx \
        src/components/ui/select.tsx src/components/ui/input.spec.tsx
git commit -m "fix(responsive): 16px form controls on mobile to stop iOS focus zoom"
```

---

## Task 4: Dialog height cap and dynamic viewport units (F3, F6)

One file fixes all 14 dialog sites. `DialogContent` is `w-full max-w-lg` with no
`max-h` and no scroll — a tall form's submit button is simply unreachable on a
phone. The grid container's `70vh` has the same class of bug: `vh` is the
*large* viewport, so it overflows while browser chrome is visible.

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/sheet/styles.ts`
- Test: `src/components/ui/dialog.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

`src/components/ui/dialog.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

describe('DialogContent fits a phone screen', () => {
  function open() {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit</DialogTitle>
          <p>body</p>
        </DialogContent>
      </Dialog>,
    );
    return screen.getByRole('dialog');
  }

  it('caps its height against the dynamic viewport', () => {
    // `dvh`, not `vh`: vh is the large viewport, so a 90vh dialog is taller
    // than the screen while the mobile browser chrome is showing.
    expect(open().className).toContain('max-h-[90dvh]');
  });

  it('scrolls its own overflow rather than clipping it', () => {
    expect(open().className).toContain('overflow-y-auto');
  });

  it('leaves a gutter on a narrow screen', () => {
    // `max-w-lg` alone lets the panel touch both edges at 390px.
    expect(open().className).toMatch(/w-\[calc\(100%-2rem\)\]/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

- [ ] **Step 3: Implement**

In `dialog.tsx:38`, change the leading run of the class string to:

```
'fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-lg …'
```

Three changes: `w-full` → `w-[calc(100%-2rem)]` (a 1rem gutter each side),
`max-h-[90dvh] overflow-y-auto` added, `p-6` → `p-4 sm:p-6`. Everything after is
untouched.

Add above it:

```tsx
// `dvh` not `vh`: `vh` measures the large viewport, so a 90vh panel is taller
// than the screen while mobile browser chrome is showing and the footer with
// the submit button falls off. `overflow-y-auto` is what makes a long form
// reachable at all — without it the content is simply clipped.
```

In `src/components/sheet/styles.ts`, `SHEET_CONTAINER`:
`max-h-[70vh]` → `max-h-[70dvh]`, with a one-line comment giving the same
reason.

- [ ] **Step 4: Verify**

```bash
npx vitest run
```
Expected: 301 passed, 1 skipped. Watch for dialog-heavy suites
(`settings/users`) — a changed class string should not affect them, and if one
breaks, read why before adjusting anything.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/sheet/styles.ts \
        src/components/ui/dialog.spec.tsx
git commit -m "fix(responsive): cap dialog height with dvh and scroll long forms"
```

---

## Task 5: Extract `SidebarContent` (no behaviour change)

Splits the brand block and nav out of the positioned `<aside>` so the drawer can
reuse it verbatim in Task 6. `Sidebar`'s props and rendered output are
unchanged, so **the existing 12 tests stay green without edits** — that is the
check that this task changed nothing observable.

**Files:**
- Create: `src/components/layout/SidebarContent.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `src/components/layout/Sidebar.spec.tsx` — **unchanged, must still pass**

**Interfaces:**
- Consumes: `navigationFor`, `featureForPath` from `@/lib/rbac/features`;
  `NAV_ICONS`, `DEFAULT_NAV_ICON` from `./navIcons`
- Produces:
  `SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void })`
  — the brand block, separator and `<nav aria-label="Main">`. `onNavigate` fires
  after a nav item is clicked so the drawer can close itself; the static sidebar
  passes nothing.

- [ ] **Step 1: Establish the baseline**

```bash
npx vitest run src/components/layout/Sidebar.spec.tsx
```
Expected: 12 passed. Record it — this exact number must hold through Step 4.

- [ ] **Step 2: Move the markup**

Cut everything inside the `<aside>` — the brand `<div>`, the `<Separator>` and
the `<nav>`, plus `renderItem`, `DECORATED_GROUPS`, the `usePathname` /
`useRouter` / `useAuth` calls and the `groups` / `activeKey` derivations — into
`SidebarContent.tsx`. Move the RBAC comments with them; they explain
`navigationFor` and the longest-prefix `activeKey`, and belong next to that code.

The collapse `<Button>` **stays in `Sidebar`**: it is a desktop affordance and
the drawer must not render it. It currently lives inside the brand row, so
`SidebarContent` takes the brand block and `Sidebar` renders the toggle beside
it.

Call `onNavigate?.()` immediately after `router.push(item.href)` in `renderItem`.

- [ ] **Step 3: Reduce `Sidebar` to the shell**

`Sidebar.tsx` keeps only the `<aside>`, its width/gradient style, and the
collapse toggle, rendering `<SidebarContent collapsed={collapsed} />` inside.
Keep exporting `DRAWER_WIDTH` and `COLLAPSED_WIDTH` — `Header.tsx` imports
`DRAWER_WIDTH` until Task 6.

- [ ] **Step 4: Verify nothing observable changed**

```bash
npx vitest run src/components/layout/Sidebar.spec.tsx   # must be 12 passed, file unedited
npx vitest run                                          # 301 passed, 1 skipped
npx tsc --noEmit
```

If a Sidebar test fails, the extraction changed behaviour — fix
`SidebarContent`, **not the test**. The test file must not appear in this
commit's diff.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/SidebarContent.tsx src/components/layout/Sidebar.tsx
git commit -m "refactor(layout): extract SidebarContent so the drawer can reuse it"
```

---

## Task 6: Replace the shell's pixel contract (F2)

The load-bearing task. Three components share a pixel contract driven by one
`collapsed` boolean: `Sidebar` is `fixed inset-y-0 left-0` at `sidebarWidth`,
`Header` computes `left` and `width` from it, and `main` sets `marginLeft`.
There is no way to express "no sidebar", which is why nothing below `md` works.

- [ ] **Step 1: Write the failing tests**

`src/components/layout/AppShell.spec.tsx` (new). The critical one is the
**RBAC parity** test — it is what stops a second nav source from drifting.

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Mock useAuth to a fixed permission set; mirror the mocks Sidebar.spec.tsx
// already uses so the two suites agree about what a session looks like.
const PERMISSIONS = ['dashboard', 'inventory-history', 'production', 'notifications'];

describe('app shell below the breakpoint', () => {
  it('keeps the static sidebar out of the layout below md', () => {
    render(<AppShell />);
    // The aside is `hidden md:flex` — present in the DOM, removed from layout
    // by CSS. jsdom cannot compute that, so assert the class contract.
    expect(screen.getByTestId('sidebar-aside').className).toContain('hidden');
    expect(screen.getByTestId('sidebar-aside').className).toContain('md:flex');
  });

  it('offers a menu trigger that is hidden from md up', () => {
    render(<AppShell />);
    expect(screen.getByRole('button', { name: /open navigation/i }).className)
      .toContain('md:hidden');
  });

  it('mounts the drawer nav only once it is opened', async () => {
    render(<AppShell />);
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    expect(screen.getAllByRole('navigation', { name: 'Main' })).toHaveLength(2);
  });

  /**
   * The RBAC coupling. The drawer must render the same `navigationFor(permissions)`
   * output as the aside — one source, not two. A second nav could drift and
   * offer a manager a link RouteGuard then bounces them off.
   */
  it('shows the drawer exactly the items the sidebar shows', async () => {
    render(<AppShell />);
    const asideItems = within(screen.getByTestId('sidebar-aside'))
      .getAllByRole('button').map((b) => b.textContent);

    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    const drawerItems = within(screen.getByRole('dialog'))
      .getAllByRole('button').map((b) => b.textContent);

    expect(drawerItems).toEqual(expect.arrayContaining(asideItems));
  });

  it('closes the drawer after a navigation', async () => {
    render(<AppShell />);
    await userEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Production'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

Extract the shell's markup into `src/components/layout/AppShell.tsx` so it is
renderable without Next's layout machinery; `(app)/layout.tsx` becomes
`<AuthGuard><AppShell>{children}</AppShell></AuthGuard>`.

- [ ] **Step 2: Run them, verify they fail**

- [ ] **Step 3: Implement**

`src/components/layout/AppShell.tsx`:

```tsx
'use client';

/**
 * The authenticated shell. Holds the collapse state (persisted) and the mobile
 * drawer state (not persisted — a drawer should never be open on arrival).
 *
 * There is no `useIsMobile` here on purpose. The aside is `hidden md:flex` and
 * the drawer's content only mounts when the Sheet opens, so the nav never
 * exists twice and there is nothing for the server and client to disagree
 * about on hydration. JS breakpoint detection is reserved for the Dialog/Sheet
 * swap, where the two really are different components.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('sidebar-collapsed') === 'true');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleToggle = () => setCollapsed((v) => {
    const next = !v;
    localStorage.setItem('sidebar-collapsed', String(next));
    return next;
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-[280px] p-0 border-r-0 text-white [background:linear-gradient(180deg,#33200F_0%,#241407_100%)]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setDrawerOpen(true)} />
        <main className="flex-1 bg-background p-4 md:p-6">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
```

`Sidebar.tsx` — the `<aside>` drops `fixed inset-y-0 left-0 z-40` and gains
`hidden md:flex sticky top-0 h-screen shrink-0`, plus
`data-testid="sidebar-aside"`. It keeps its inline `width` and gradient.

`Header.tsx` — drop the `sidebarWidth` prop, the `DRAWER_WIDTH` import and the
`style={{ left, width }}`. It becomes
`sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b bg-background/95 px-4 md:px-6 …`
and gains, as its first child:

```tsx
<Button
  variant="ghost"
  size="icon"
  className="md:hidden size-11"
  aria-label="Open navigation"
  onClick={onOpenNav}
>
  <Menu className="size-5" />
</Button>
```

`(app)/layout.tsx` — reduces to `<AuthGuard><AppShell>{children}</AppShell></AuthGuard>`.
Delete `sidebarWidth`, the `marginLeft`, and the `pt-20` that only existed to
clear a fixed header.

**`min-w-0` on the content column is load-bearing.** Without it a flex child
refuses to shrink below its content's intrinsic width, and one wide table pushes
the whole page into horizontal scroll — the exact failure Task 11 asserts
against.

- [ ] **Step 4: Verify**

```bash
npx vitest run src/components/layout/    # Sidebar 12 + RouteGuard 13 unedited, + 5 new
npx vitest run
npx tsc --noEmit && npx next lint
```

- [ ] **Step 5: Manual check at three widths**

`npm run dev`, then 390 / 768 / 1280. At 1280 the layout is the same as before
except the collapse toggle now sits in the sidebar's own header row rather than
overlapping the page header — a small, intended visual change, not a regression.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/AppShell.tsx src/components/layout/AppShell.spec.tsx \
        src/components/layout/Sidebar.tsx src/components/layout/Header.tsx \
        "src/app/(app)/layout.tsx"
git commit -m "feat(responsive): flex app shell with a mobile nav drawer"
```

---

## Task 7: Dashboard rows follow the granted panel count (F4)

The RBAC × layout interaction. Both dashboard rows are `lg:grid-cols-3` with
conditionally-rendered children, so the column count is a constant while the
child count is a function of the viewer's permissions. A MANAGER holds
`branch-orders` and `low-stock` but not `branch-gaps` and gets two cards in a
three-column grid; the charts row is 2-of-3 even for an admin.

An intrinsic layout removes the mismatch instead of enumerating cases: with
`repeat(auto-fit, minmax(20rem, 1fr))` the column count is derived from how many
children survived their `useCan` and how much width there is. It is also the
responsive fix, so it replaces the `lg:` breakpoint rather than adding to it.

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Test: `src/app/(app)/dashboard/dashboard-layout.spec.tsx` (new)

- [ ] **Step 1: Write the failing test**

Render the dashboard with a MANAGER-shaped permission set (`dashboard`,
`dashboard:kpis`, `dashboard:production-mix`, `dashboard:low-stock`,
`dashboard:branch-orders` — no `revenue-trend`, `branch-gaps`, `rejections`) and
a stubbed summary, then assert:

```tsx
it('lays cards out by how many the viewer holds, not a fixed three', () => {
  renderDashboard({ permissions: MANAGER_PANELS });
  const row = screen.getByTestId('dashboard-operations-row');
  expect(row.className).toContain('auto-fit');
  expect(row.className).not.toContain('grid-cols-3');
});

it('renders no empty column for a panel the viewer lacks', () => {
  renderDashboard({ permissions: MANAGER_PANELS });
  expect(screen.queryByText('Inventory Coverage')).not.toBeInTheDocument();
  expect(screen.getByText('Branch Orders')).toBeInTheDocument();
});

it('still hides the whole row when no panel in it is held', () => {
  renderDashboard({ permissions: ['dashboard', 'dashboard:kpis'] });
  expect(screen.queryByTestId('dashboard-operations-row')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it, verify it fails**

- [ ] **Step 3: Implement**

Both rows (`page.tsx:115` and `:184`) become:

```tsx
<div
  data-testid="dashboard-operations-row"
  className="mb-6 grid gap-4 grid-cols-[repeat(auto-fit,minmax(20rem,1fr))]"
>
```

Keep the existing `{(canOrders || canGaps || canLowStock) && …}` row guards —
they are what stops an empty grid rendering its margin. Drop the
`lg:col-span-3` compensator on the production-mix card; `auto-fit` already
gives a lone card the full width, which is what that class was hand-rolling for
one case out of several.

Add the comment that explains why this is not a plain breakpoint:

```tsx
// `auto-fit` rather than a fixed column count: which cards render is a
// function of the viewer's panel permissions (see `dashboard` in
// src/lib/rbac/features.ts), so the column count has to be derived, not
// declared. A manager holding two of these three panels would otherwise get
// two cards in a three-column grid. 20rem is the narrowest a card stays
// readable, so this also collapses to one column on a phone for free.
```

- [ ] **Step 4: Verify** — `npx vitest run`; then `npm run dev` and confirm the
      dashboard at 1280 as an admin looks unchanged apart from the charts row
      now filling its width.
- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx" "src/app/(app)/dashboard/dashboard-layout.spec.tsx"
git commit -m "fix(dashboard): size panel rows by granted panels instead of a fixed 3 columns"
```

---

## Task 8: Screen sweep (F7, F8, F9)

The short tail. Three independent edits; verify after each.

**Files:**
- Modify: `src/app/(app)/settings/permissions/page.tsx`
- Modify: `src/app/(app)/recipes/page.tsx`
- Modify: `src/app/(app)/settings/users/page.tsx`
- Modify: `src/app/(app)/sales/page.tsx`

- [ ] **Step 1: The raw table (F8)**

`settings/permissions/page.tsx:173` — `<table className="w-full text-sm">` is
the only raw table in the app and so the only one outside `ui/table.tsx`'s
scroll container. Swap it for `<Table>` / `<TableHeader>` / `<TableBody>` /
`<TableRow>` / `<TableHead>` / `<TableCell>`.

The matrix is five role columns plus a permission-name column, and the name is
useless once scrolled away, so the first column gets
`sticky left-0 z-20 bg-background` (copy the pattern from
`ProductionSheet.tsx:95,162`, including a solid background — a transparent
sticky cell shows the scrolling content through it).

Keep the existing tree markup (chevrons, `MatrixCell`, `SensitiveBadge`,
`KindIcon`) exactly as it is; only the table elements change.

- [ ] **Step 2: The two rigid grids (F9)**

`recipes/page.tsx:247` and `settings/users/page.tsx:654`:
`grid-cols-2` → `grid-cols-1 sm:grid-cols-2`.

- [ ] **Step 3: The sales header (F7)**

`sales/page.tsx:119-128` injects a branch `Select` (`h-6 text-xs` — 24px tall,
12px text) plus an export `Button` into the fixed header row, which cannot wrap
at 390px.

Below `md`, render the same controls in the page body instead of the header:

```tsx
const controls = (/* the existing headerContent + export Button, once */);

usePageHeader({
  title: 'Revenue',
  // Above md the shell header has room; below it the same controls render in
  // the page body, where they can wrap. Defined once and placed twice — a
  // second copy could drift out of sync with the branch scope it is filtering.
  content: <div className="hidden md:flex md:items-center md:gap-4">{controls}</div>,
});
```

and at the top of the page body:

```tsx
<div className="mb-4 flex flex-wrap items-center gap-3 md:hidden">{controls}</div>
```

**RBAC:** `controls` must be built once and rendered twice, never duplicated as
two JSX trees. There is no `useCan` on this screen today — the `sales` feature
key gates the whole route, and the export endpoint carries `@RequireFeature` —
so nothing is bypassed on day one. The rule is about the day a panel key is
added here: a hand-written second copy is where that gate gets forgotten, and
the branch `Select` in particular filters `BranchGuard`-scoped data. Raise the
trigger to `h-11 md:h-6` so the mobile copy is tappable.

- [ ] **Step 4: Verify**

```bash
npx vitest run && npx tsc --noEmit && npx next lint
```
Expected: unchanged count, still green. The permissions screen has no unit test;
Task 11 covers it.

- [ ] **Step 5: Commit** (one commit; these are one sweep)

```bash
git commit -am "fix(responsive): scrollable permissions matrix, wrapping grids and sales header"
```

---

## Task 9: `ResponsiveDialog`

A modal centred at 390px with a keyboard open is the worst remaining surface.
The convention is a bottom sheet on mobile. `ui/sheet.tsx` already has a
`bottom` variant on the same Radix Dialog primitive, so this needs **no new
dependency** — see the spec's *Approach* for why `vaul` was dropped.

**Files:**
- Create: `src/components/ui/responsive-dialog.tsx`
- Test: `src/components/ui/responsive-dialog.spec.tsx`
- Modify: `inventory/components/InventoryAdjustmentsDialog.tsx`,
  `material-inventory/components/AdjustmentsDialog.tsx`,
  `material-inventory/components/StockCardDialog.tsx`,
  `production-orders/components/ProductionOrderFormDialog.tsx`

**Interfaces:**
- Consumes: `useIsMobile` (Task 1), `Dialog*`, `Sheet*`
- Produces: `ResponsiveDialog`, `ResponsiveDialogContent`,
  `ResponsiveDialogHeader`, `ResponsiveDialogTitle`,
  `ResponsiveDialogDescription`, `ResponsiveDialogFooter` — same call shape as
  `Dialog*`, so a conversion is an import swap plus a rename.

- [ ] **Step 1: Write the failing test**

```tsx
describe('ResponsiveDialog', () => {
  it('renders a centred dialog above the breakpoint', () => { /* matchMedia false */ });
  it('renders a bottom sheet below it',              () => { /* matchMedia true  */ });
  it('always exposes an accessible name',            () => { /* both branches    */ });
  it('caps the sheet height and scrolls its body',   () => { /* max-h-[85dvh]    */ });
  it('clears the home indicator',                    () => { /* pb-safe          */ });
});
```

Use the `installMatchMedia` helper from Task 1's spec — export it from a small
`src/test/matchMedia.ts` rather than copying it.

- [ ] **Step 2: Run it, verify it fails**

- [ ] **Step 3: Implement**

```tsx
'use client';

/**
 * A modal that is a centred Dialog on desktop and a bottom sheet on mobile.
 *
 * This is the one place JS breakpoint detection is warranted: the two are
 * different components with different animations and focus behaviour, so no
 * amount of CSS turns one into the other. Everywhere else, use a `md:` class.
 *
 * Built on `ui/sheet.tsx`'s `bottom` variant rather than vaul — same Radix
 * Dialog primitive underneath, same a11y model, no new dependency. The trade
 * is no drag-to-dismiss.
 */
export function ResponsiveDialogContent({ className, children, ...props }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <SheetContent
        side="bottom"
        className={cn('max-h-[85dvh] overflow-y-auto rounded-t-xl pb-safe', className)}
        {...props}
      >
        {children}
      </SheetContent>
    );
  }
  return <DialogContent className={className} {...props}>{children}</DialogContent>;
}
```

The root, header, title, description and footer follow the same pattern. The
footer stacks (`flex-col-reverse`) on mobile so the primary action sits under
the thumb — the reverse ordering keeps the DOM order (and so the tab order)
correct while flipping the visual order.

`ResponsiveDialogTitle` must render `SheetTitle` or `DialogTitle`, never a bare
heading: both primitives need a title for their accessible name.

- [ ] **Step 4: Convert the four data-entry dialogs**

Import swap and rename per file. Leave the other ten on `Dialog` — Task 4
already made them usable, and converting a delete-confirmation to a bottom sheet
buys nothing.

- [ ] **Step 5: Verify**

```bash
npx vitest run
npx vitest run "src/app/(app)/settings/users"   # the dialog-heavy suite
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/responsive-dialog.tsx src/components/ui/responsive-dialog.spec.tsx \
        src/test/matchMedia.ts "src/app/(app)/inventory/components" \
        "src/app/(app)/material-inventory/components" "src/app/(app)/production-orders/components"
git commit -m "feat(responsive): bottom-sheet modals on mobile for the data-entry dialogs"
```

---

## Task 10: The three grid screens (Phase 5)

`/inventory/details`, `/material-inventory`, `/production`. These keep their
desktop shape. They get a frozen identity column so a row stays identifiable
while scrolled, and an honest notice that entry wants a bigger screen.

**`ProductionSheet.tsx` already has the sticky column** (`:95`, `:162`) — it is
the reference implementation, not a target. Only two files need the change.

**Files:**
- Create: `src/components/layout/SmallScreenNotice.tsx`
- Modify: `src/app/(app)/inventory/components/InventoryTypeTables.tsx`
- Modify: `src/app/(app)/material-inventory/page.tsx`
- Modify: the three page files, to place the notice
- Test: `src/components/layout/SmallScreenNotice.spec.tsx`

- [ ] **Step 1: Sticky identity column on the two that lack it**

`InventoryTypeTables.tsx:71` and `material-inventory/page.tsx:199` — the
"Product" and "Material" heads and their matching body cells get
`sticky left-0 z-30` (head) and `sticky left-0 z-10` (cell), plus an opaque
background.

Copy `ProductionSheet`'s `stickyBg` treatment: the sticky cell needs its own
solid background that tracks the row's state, because a `bg-transparent` sticky
cell lets the scrolling columns show through it. `SHEET_TABLE` is
`border-separate`, which is what makes the sticky borders hold — do not change
it.

- [ ] **Step 2: The notice**

```tsx
/**
 * Says plainly that bulk entry is a desktop task, instead of leaving someone to
 * discover it by fighting a twelve-column grid on a phone. Dismissible, and the
 * dismissal is remembered per screen — a daily user should see it once.
 *
 * Render this INSIDE the screen's permission-gated body. Above the gate, a user
 * who cannot open the screen would still be told how to use it.
 */
export function SmallScreenNotice({ storageKey }: { storageKey: string }) {
  // md:hidden — CSS, not useIsMobile: there is nothing here that differs
  // structurally between the two, only whether it is shown.
}
```

Use `Alert` (project rule: callouts are `Alert`, not styled divs) with a
`size-11` dismiss button.

Tests: renders with `md:hidden`; hides after dismiss; stays hidden on remount
with the same `storageKey`; a corrupt/absent `localStorage` value still renders
(never throw on a read).

- [ ] **Step 3: Place it**

One line near the top of each of the three screens' rendered body — inside
whatever the page already renders after its loading/error branches, so it is
inside the permission gate.

- [ ] **Step 4: Verify** — `npx vitest run`, `npx tsc --noEmit`
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(responsive): frozen identity column and a small-screen notice on the grids"
```

---

## Task 11: Three-viewport verification walk

Makes "looks broken" measurable. Horizontal body overflow is the objective
version of the complaint, and it is one assertion per screen.

- [ ] **Step 1: Start the app**

```bash
npm run build && npm start     # production build: `next dev` forces NODE_ENV=development
```

Log in as an **ADMIN** and again as a **MANAGER** — the manager pass is what
exercises Task 7's variable card count and the narrowed nav, and it is the role
this whole RBAC phase was for.

- [ ] **Step 2: Walk every screen at 390 / 768 / 1280**

Via the Playwright MCP tools. The 26 screens under `src/app/(app)`; at 390 a
manager will not see all of them, which is itself the check that Task 6 changed
no permissions.

For each screen and width:

```js
() => {
  const d = document.documentElement;
  return { w: window.innerWidth, scroll: d.scrollWidth, client: d.clientWidth,
           overflow: d.scrollWidth > d.clientWidth };
}
```

`overflow` must be `false`. A wide table scrolling *inside* its own container is
correct and does not trip this; the body scrolling does.

- [ ] **Step 3: Measure tap targets at 390**

Not by eye — the spec commits to 44px for primary controls below `md`:

```js
() => [...document.querySelectorAll('button, a[href], [role="button"], input, select')]
  .map((el) => ({ el: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 30),
                  ...el.getBoundingClientRect().toJSON() }))
  .filter((r) => r.width < 44 || r.height < 44)
```

Expected survivors: grid cells (`SHEET_CELL h-8`, `SheetInput h-8`) — exempt by
the spec, and reachable only on the three screens the notice covers. Anything
else in the list is a finding: record it, and fix it if it is a primary control.
Nothing may be under 24px (WCAG 2.2 AA).

- [ ] **Step 4: Check the five interactions CSS cannot prove**

At 390: the nav drawer opens, navigates, and closes; a data-entry dialog opens
as a bottom sheet with its submit button reachable; a text input focuses
**without the viewport zooming** (the F1 fix — check on a real iPhone or an iOS
simulator, since desktop Chrome's device emulation does not reproduce it); a
grid scrolls horizontally with its first column frozen; the drawer's item list
matches the sidebar's for the same account.

- [ ] **Step 5: Full suite + lint**

```bash
npx jest          # 588 passed, 27 suites
npx vitest run    # 294 baseline + the new specs, 1 skipped
npx tsc --noEmit
npx next lint     # 0 errors; 26 pre-existing warnings are expected
```

- [ ] **Step 6: Record the results**

Append a **Verification** section to the spec: the screen × viewport overflow
table, the tap-target survivors and why each is acceptable, and the final test
counts. A plan that claims "responsive" without a measurement is the thing this
task exists to prevent.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-02-mobile-responsive-design.md
git commit -m "docs: record the three-viewport verification results"
```

---

## Sequencing notes

- **Tasks 1–4 are independent of each other** and of everything after; they can
  land in any order or in parallel. They are also the highest value per line —
  F1 and F3 alone make forms usable on a phone with no screen touched.
- **Task 5 must precede Task 6.** Task 6 depends on `SidebarContent` existing.
- **Tasks 7, 8, 9, 10 are independent of each other** but all assume Task 6.
- **Task 11 is last** and needs a running app.
- If this branch is rebased onto `feature/landing-page-ui-refresh`, do it
  **before Task 6** — that branch rewrites `Header.tsx` and `globals.css`, and
  merging a rewritten header into a rewritten header is worse than doing Task 6
  once, afterwards.
