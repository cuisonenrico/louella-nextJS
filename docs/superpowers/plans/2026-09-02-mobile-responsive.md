# Mobile-Responsive Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Louella web app usable on a phone for reading and light editing, without pretending twelve-column grid entry works at 390px.

**Architecture:** Delete the pixel contract that couples `Sidebar`, `Header` and `main` in `(app)/layout.tsx`, replacing it with an ordinary flex layout. The sidebar renders as a static `<aside>` from `md` up and as a `Sheet` drawer below it — a pure CSS breakpoint, because the drawer's content only mounts when open. JS breakpoint detection is used for exactly one thing: swapping `Dialog` for `Drawer` on mobile, where the two are genuinely different components.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui (hand-vendored — there is no `components.json`), Radix primitives, vaul (added in Task 6), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-mobile-responsive-design.md`

## Global Constraints

- **Package manager is npm.** There is no `packageManager` field; use `npm` and `npx`.
- **Run all commands from `louella-web/`,** not the workspace root. Running vitest from the root picks up a different config and fails with `describe is not defined`.
- **The shell breakpoint is `md` (768px).** One breakpoint for the whole shell. Do not introduce a second.
- **`Sidebar`'s props must stay `{ collapsed: boolean; onToggle: () => void }`.** `Sidebar.spec.tsx` renders it directly; 12 tests depend on that signature.
- **Never change which nav items a role sees.** This refactor is layout only. `navigationFor(permissions)` and the RBAC manifest are out of bounds. 12 Sidebar tests and 13 RouteGuard tests must pass untouched at every step.
- **No `space-x-*` / `space-y-*`** — use `flex` with `gap-*` (project shadcn rule).
- **Use `size-*` when width and height are equal** — `size-4`, not `w-4 h-4`.
- **No manual `z-index` on overlay components.** Dialog, Sheet, Drawer manage their own stacking.
- **Dialog, Sheet and Drawer always need a title** — `DialogTitle` / `SheetTitle` / `DrawerTitle`, with `className="sr-only"` if visually hidden.
- **Two unrelated things are called "sheet".** `src/components/ui/sheet.tsx` is the Radix drawer. `src/components/sheet/` is the spreadsheet module. In commits and comments, call the latter **the grid**.
- **Baseline to keep green:** 588 server tests (`npx jest`), 294 frontend + 1 skipped (`npx vitest run`).

---

### Task 1: `useIsMobile` hook

Needed only by Task 6's dialog swap, but built first so it is available and independently tested.

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
 * viewport. vitest.setup.ts installs a stub that always reports `matches:
 * false`; this replaces it per-test so both branches are exercised.
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/useIsMobile.spec.ts`
Expected: FAIL — `Failed to resolve import "./useIsMobile"`

- [ ] **Step 3: Write minimal implementation**

`src/lib/useIsMobile.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

/**
 * The one shell breakpoint, matching Tailwind's `md`.
 *
 * Exported so the hook and the `md:` utility classes cannot drift apart. The
 * media query is `max-width: 767px` rather than `max-width: 768px` because
 * Tailwind's `md:` applies at >= 768px — at exactly 768 a `768px` query would
 * be true while `md:` was also active, giving a viewport both the desktop
 * sidebar and the mobile dialog.
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
 * Dialog/Drawer swap is the one case in this app.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/useIsMobile.spec.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/useIsMobile.ts src/lib/useIsMobile.spec.ts
git commit -m "feat(responsive): add useIsMobile hook and shared breakpoint"
```

---

### Task 2: Extract `SidebarContent` from `Sidebar`

Splits the sidebar's brand + nav out of the positioned `<aside>` so the drawer can reuse it verbatim. `Sidebar`'s props and rendered output are unchanged, so the existing 12 tests stay green without edits — that is the check that this task changed nothing observable.

**Files:**
- Create: `src/components/layout/SidebarContent.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `src/components/layout/Sidebar.spec.tsx` (unchanged — must still pass)

**Interfaces:**
- Consumes: `navigationFor`, `featureForPath` from `@/lib/rbac/features`; `NAV_ICONS`, `DEFAULT_NAV_ICON` from `./navIcons`
- Produces: `SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void })` — the brand block, separator and `<nav aria-label="Main">`. `onNavigate` fires after a nav item is clicked, so the drawer can close itself.

- [ ] **Step 1: Run the existing suite to establish the baseline**

Run: `npx vitest run src/components/layout`
Expected: PASS — 25 tests (12 Sidebar, 13 RouteGuard). Record this number.

- [ ] **Step 2: Create `SidebarContent.tsx`**

Move the brand block, `Separator`, `renderItem` and `<nav>` out of `Sidebar.tsx` verbatim. The only additions are the `onNavigate` call and the `DECORATED_GROUPS` map moving with the nav it decorates.

```tsx
'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Settings, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { featureForPath, navigationFor, type NavGroup } from '@/lib/rbac/features';
import { DEFAULT_NAV_ICON, NAV_ICONS } from './navIcons';

/**
 * Groups that render with their own heading and icon rather than a plain
 * separator, preserving the previous visual treatment of Config and Settings.
 */
const DECORATED_GROUPS: Partial<Record<NavGroup, { icon: typeof Settings }>> = {
  Config: { icon: Settings },
  Settings: { icon: ShieldCheck },
};

/**
 * The sidebar's brand and navigation, with no positioning of its own.
 *
 * Rendered by both shells: the static `<aside>` on desktop and the `Sheet`
 * drawer on mobile. Keeping it positionless is what lets those two differ
 * purely in their wrapper, so the nav a role sees can never diverge between
 * viewports.
 */
export default function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions } = useAuth();

  // Derived entirely from the shared RBAC manifest and the user's effective
  // permissions. The sidebar deliberately knows nothing about roles: role is
  // resolved into permissions server-side, so there is exactly one place where
  // "who may see what" is decided.
  const groups = navigationFor(permissions);

  // Which feature owns the current URL. Resolving this once, by longest prefix,
  // is what keeps exactly one item highlighted: /production/orders belongs to
  // `production-orders`, not to `production`, even though both prefixes match.
  const activeKey = featureForPath(pathname)?.key ?? null;

  function renderItem(item: { key: string; href: string; label: string }) {
    const active = item.key === activeKey;
    const Icon = NAV_ICONS[item.key] ?? DEFAULT_NAV_ICON;

    const btn = (
      <li key={item.href}>
        <button
          onClick={() => {
            router.push(item.href);
            onNavigate?.();
          }}
          className={cn(
            'flex w-full items-center rounded-lg text-sm transition-colors',
            collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2 gap-3',
            active
              ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
          )}
        >
          <Icon
            className={cn(
              'h-[18px] w-[18px] shrink-0',
              active ? 'text-primary-foreground' : 'text-white/60'
            )}
          />
          {!collapsed && <span>{item.label}</span>}
        </button>
      </li>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.href} delayDuration={0}>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return btn;
  }

  return (
    <>
      <div
        className={cn(
          'flex items-center pt-4 pb-2 min-h-[56px]',
          collapsed ? 'justify-center px-0' : 'px-4'
        )}
      >
        {collapsed ? (
          <div className="bg-white rounded-md p-0.5 flex">
            <Image src="/favicon.png" alt="Louella" width={28} height={28} style={{ objectFit: 'contain' }} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="bg-white rounded-md p-0.5 flex">
              <Image src="/favicon.png" alt="Louella" width={32} height={32} style={{ objectFit: 'contain' }} />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold italic leading-tight text-white">Louella</h1>
              <span className="text-[11px] uppercase tracking-[0.18em] text-white/50">Panaderya</span>
            </div>
          </div>
        )}
      </div>

      <Separator className="bg-white/15 mx-2" />

      <nav
        aria-label="Main"
        className={cn('flex-1 overflow-y-auto pb-2', collapsed ? 'px-1 mt-2' : 'px-2 mt-1')}
      >
        {groups.map(({ group, items }, gi) => {
          const decoration = DECORATED_GROUPS[group];
          const GroupIcon = decoration?.icon;
          return (
            <div key={group} className={gi > 0 ? 'mt-1' : undefined}>
              {gi > 0 &&
                (collapsed ? (
                  <Separator className="bg-white/15 mx-1 my-1.5" />
                ) : (
                  <div className="mt-3 mb-1 px-2 flex items-center gap-1.5">
                    {GroupIcon && <GroupIcon className="h-3 w-3 text-white/50" />}
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                      {group}
                    </span>
                    <div className="flex-1 h-px bg-white/15" />
                  </div>
                ))}
              <ul className="space-y-0.5">{items.map(renderItem)}</ul>
            </div>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 3: Rewrite `Sidebar.tsx` to wrap it**

Note the surviving `SIDEBAR_GRADIENT` export — Task 3's drawer needs the same background, and duplicating the literal would let the two shells drift visually.

```tsx
'use client';

import { ChevronLeft, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SidebarContent from './SidebarContent';

export const DRAWER_WIDTH = 240;
export const COLLAPSED_WIDTH = 64;

/** Shared by the static aside and the mobile drawer so they cannot drift. */
export const SIDEBAR_GRADIENT = 'linear-gradient(180deg, #33200F 0%, #241407 100%)';

/**
 * The desktop sidebar: a static flex child, hidden below `md`.
 *
 * It no longer positions itself with `fixed` and no longer participates in a
 * pixel contract with Header and main — they are all flow children now, which
 * is what makes "no sidebar at all" expressible on a phone.
 *
 * Below `md` the same content renders inside a Sheet drawer, mounted by
 * `(app)/layout.tsx`. The drawer's content only exists while it is open, so
 * nothing is rendered twice.
 */
export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const width = collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;

  return (
    <aside
      className="hidden md:flex shrink-0 flex-col overflow-hidden text-white transition-[width] duration-200"
      style={{ width, background: SIDEBAR_GRADIENT }}
    >
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-end px-2 pt-2')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="text-white hover:bg-white/10 size-8"
        >
          {collapsed ? <Menu className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>
      </div>
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
```

- [ ] **Step 4: Run the layout suite to prove nothing observable changed**

Run: `npx vitest run src/components/layout`
Expected: PASS — the same 25 tests, with no edits to either spec file. If Sidebar tests fail here, the extraction changed behaviour; fix the component, not the test.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/components/layout/Sidebar.tsx src/components/layout/SidebarContent.tsx
git commit -m "refactor(layout): extract SidebarContent, make Sidebar a static flex child"
```

---

### Task 3: Replace the shell's pixel contract

The load-bearing change. `Header` stops computing `left`/`width`, `main` stops setting `marginLeft`, and a drawer appears below `md`.

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/Header.tsx`
- Create: `src/components/layout/MobileNav.tsx`
- Test: `src/components/layout/MobileNav.spec.tsx`

**Interfaces:**
- Consumes: `SidebarContent` (Task 2), `SIDEBAR_GRADIENT` (Task 2), `Sheet`/`SheetContent`/`SheetTitle` from `@/components/ui/sheet`
- Produces: `MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void })`; `Header` loses its `sidebarWidth` prop and gains `onOpenNav?: () => void`

- [ ] **Step 1: Write the failing test**

`src/components/layout/MobileNav.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const pathname = { current: '/dashboard' };
const push = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <span>{String(props.alt ?? '')}</span>,
}));

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const { default: MobileNav } = await import('./MobileNav');

function renderNav(open: boolean, permissions: string[], onOpenChange = vi.fn()) {
  auth.permissions = permissions;
  return {
    onOpenChange,
    ...render(
      <TooltipProvider>
        <MobileNav open={open} onOpenChange={onOpenChange} />
      </TooltipProvider>,
    ),
  };
}

describe('MobileNav', () => {
  it('renders nothing while closed', () => {
    // The drawer must not render a second copy of the nav behind the desktop
    // sidebar — that would duplicate every item in the accessibility tree.
    renderNav(false, ['dashboard', 'products']);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(screen.queryByText('Products')).toBeNull();
  });

  it('shows the same items the sidebar would when open', () => {
    renderNav(true, ['dashboard', 'products']);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
  });

  it('shows only what the permissions allow', () => {
    renderNav(true, ['dashboard']);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Products')).toBeNull();
  });

  it('closes itself after navigating', async () => {
    // Without this a tapped link leaves the drawer covering the page it just
    // opened.
    const user = userEvent.setup();
    const { onOpenChange } = renderNav(true, ['dashboard', 'products']);

    await user.click(screen.getByText('Products'));

    expect(push).toHaveBeenCalledWith('/products');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('has an accessible title', () => {
    renderNav(true, ['dashboard']);
    expect(screen.getByText('Navigation')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/MobileNav.spec.tsx`
Expected: FAIL — `Failed to resolve import "./MobileNav"`

- [ ] **Step 3: Create `MobileNav.tsx`**

```tsx
'use client';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import SidebarContent from './SidebarContent';
import { SIDEBAR_GRADIENT } from './Sidebar';

/**
 * The sidebar as a drawer, for viewports below `md`.
 *
 * Radix mounts SheetContent only while open, so the nav exists in the DOM once
 * at most — the desktop aside is `hidden md:flex` and this is closed, or this
 * is open on a viewport where the aside is hidden. Nothing renders twice.
 *
 * Always expanded (`collapsed={false}`): the rail exists to reclaim horizontal
 * space next to content, and a drawer is not next to anything.
 */
export default function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex w-[min(17rem,85vw)] flex-col gap-0 border-r-0 p-0 text-white"
        style={{ background: SIDEBAR_GRADIENT }}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SidebarContent collapsed={false} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/MobileNav.spec.tsx`
Expected: PASS — 5 tests

- [ ] **Step 5: Rewrite `(app)/layout.tsx` as a flex layout**

```tsx
'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import RouteGuard from '@/components/layout/RouteGuard';
import Sidebar from '@/components/layout/Sidebar';
import MobileNav from '@/components/layout/MobileNav';
import Header from '@/components/layout/Header';

/**
 * Shell for all authenticated routes. Rendered once by the `(app)` route group
 * and persists across client-side navigation — the sidebar and header never
 * remount; only `children` (the page content) swaps and shows its own loading.
 *
 * Pages publish their header via `usePageHeader`; the Header reads it from the
 * shared store, so this layout takes no per-page props.
 *
 * Layout is plain flex. Header and main previously computed `left`, `width` and
 * `marginLeft` in pixels from the sidebar's width, which meant the three
 * components shared a contract with no way to say "no sidebar" — and so nothing
 * below `md` could work. They are all flow children now.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });
  const [navOpen, setNavOpen] = useState(false);

  const handleToggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
        <MobileNav open={navOpen} onOpenChange={setNavOpen} />
        {/* min-w-0 is load-bearing: without it a wide table inside a flex child
            expands the column instead of scrolling, and the whole page scrolls
            sideways. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onOpenNav={() => setNavOpen(true)} />
          <main className="min-w-0 flex-1 bg-background p-4 md:p-6">
            <RouteGuard>{children}</RouteGuard>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
```

- [ ] **Step 6: Rewrite `Header.tsx`**

The header is now a flow child, so `fixed`, `left`, `width` and the `pt-20` that main used to need all go. It gains the drawer trigger below `md`.

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeaderStore } from '@/lib/pageHeaderStore';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Sticky page header.
 *
 * `sticky` rather than `fixed`: as a flow child it already spans the content
 * column, so it needs no knowledge of the sidebar's width and main needs no
 * top padding to clear it.
 */
export default function Header({ onOpenNav }: { onOpenNav?: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const title = usePageHeaderStore((s) => s.title);
  const headerContent = usePageHeaderStore((s) => s.content);
  const headerActions = usePageHeaderStore((s) => s.actions);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:flex-nowrap md:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="md:hidden"
      >
        <Menu className="size-5" />
      </Button>

      {title && (
        <h2 className="min-w-0 truncate font-display text-lg font-semibold tracking-tight md:text-xl md:shrink-0">
          {title}
        </h2>
      )}

      {/* Page-supplied controls wrap onto their own line on a phone rather than
          squeezing the title out. */}
      {headerContent && (
        <div className="order-last flex w-full min-w-0 flex-wrap items-center gap-2 md:order-none md:w-auto md:flex-nowrap md:gap-4">
          {headerContent}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {headerActions}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <div className="flex size-8 items-center justify-center rounded-full bg-primary text-[0.8rem] font-bold text-primary-foreground">
                {initials}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {user?.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
              <LogOut className="mr-2 size-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

- [ ] **Step 7: Run the full frontend suite**

Run: `npx vitest run`
Expected: PASS — 299 + 1 skipped (294 baseline + 5 from MobileNav). The 12 Sidebar and 13 RouteGuard tests must still pass with no edits.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint "src/app/(app)/layout.tsx" src/components/layout
git add "src/app/(app)/layout.tsx" src/components/layout
git commit -m "feat(responsive): replace shell pixel contract with flex layout and mobile drawer"
```

---

### Task 4: Make dialogs survive a phone screen

The highest-value single change after the shell. `DialogContent` is `w-full max-w-lg` with no max-height and no scroll, so a tall form's submit button is unreachable on a phone. One file fixes all 14 dialog sites.

**Files:**
- Modify: `src/components/ui/dialog.tsx`
- Test: `src/components/ui/dialog.spec.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: no API change — `DialogContent` keeps its signature and gains classes

- [ ] **Step 1: Write the failing test**

`src/components/ui/dialog.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

function renderDialog() {
  render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Edit product</DialogTitle>
        <p>body</p>
      </DialogContent>
    </Dialog>,
  );
  return screen.getByRole('dialog');
}

describe('DialogContent', () => {
  it('caps its height and scrolls its own overflow', () => {
    // Without this a tall form runs past the bottom of a phone screen and the
    // submit button cannot be reached at all.
    const dialog = renderDialog();
    expect(dialog.className).toContain('max-h-[90dvh]');
    expect(dialog.className).toContain('overflow-y-auto');
  });

  it('uses dvh so mobile browser chrome does not clip it', () => {
    // 90vh measures the viewport with the URL bar hidden; on iOS Safari that
    // puts the bottom of the dialog underneath the browser chrome.
    const dialog = renderDialog();
    expect(dialog.className).not.toMatch(/max-h-\[90vh\]/);
  });

  it('leaves a gutter on narrow viewports', () => {
    const dialog = renderDialog();
    expect(dialog.className).toContain('w-[calc(100%-2rem)]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/ui/dialog.spec.tsx`
Expected: FAIL — `expected '...' to contain 'max-h-[90dvh]'`

- [ ] **Step 3: Update the `DialogContent` class list**

In `src/components/ui/dialog.tsx:38`, replace `w-full max-w-lg` with the responsive sizing and add the height cap. The rest of the class string is unchanged.

```tsx
// was: 'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] ...'
'fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-xl sm:p-6'
```

Three changes beyond the height cap: `w-[calc(100%-2rem)]` leaves a gutter instead of touching both edges; `p-4 sm:p-6` reclaims padding on small screens; `sm:rounded-xl` becomes `rounded-xl` since the dialog no longer spans edge to edge.

- [ ] **Step 4: Run the test and the suites that render dialogs**

Run: `npx vitest run src/components/ui/dialog.spec.tsx "src/app/(app)/settings"`
Expected: PASS — 3 new tests, and the 35 admin-screen tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/dialog.spec.tsx
git commit -m "fix(responsive): cap dialog height and scroll overflow so forms are reachable on phones"
```

---

### Task 5: Fix the one raw table and the two rigid grids

Small, mechanical, and independently verifiable. `ui/table.tsx` already wraps in `relative w-full overflow-auto`, so every `<Table>` consumer is fine — these are the only exceptions in the codebase.

**Files:**
- Modify: `src/app/(app)/settings/permissions/page.tsx`
- Modify: `src/app/(app)/recipes/page.tsx:247`
- Modify: `src/app/(app)/settings/users/page.tsx:654`
- Test: `src/app/(app)/settings/permissions/page.spec.tsx` (existing 18 tests must stay green)

**Interfaces:**
- Consumes: `Table`, `TableHeader`, `TableBody` from `@/components/ui/table`
- Produces: nothing

- [ ] **Step 1: Run the permissions suite to establish the baseline**

Run: `npx vitest run "src/app/(app)/settings/permissions/page.spec.tsx"`
Expected: PASS — 18 tests.

- [ ] **Step 2: Replace the raw table markup**

In `src/app/(app)/settings/permissions/page.tsx`, the role matrix currently renders `<div className="overflow-x-auto"><table className="w-full text-sm">`. Replace the wrapper and element with the shared component, which supplies its own scroll container:

```tsx
// was:
//   <div className="overflow-x-auto">
//     <table className="w-full text-sm">
//       ...
//     </table>
//   </div>
<Table className="text-sm">
  ...
</Table>
```

Add `Table` to the imports from `@/components/ui/table`. Leave `<thead>`, `<tbody>`, `<tr>` and `<td>` as they are — the shared component only wraps `<table>` itself, and swapping the inner elements would change the styling these 18 tests assert against.

- [ ] **Step 3: Make the feature column sticky while scrolling**

A five-column matrix is wider than a phone. Without this the row labels scroll away and the switches become unidentifiable. Add to the first `<th>` and each row's first `<td>`:

```tsx
className="sticky left-0 z-10 bg-background"
```

For the group heading rows, whose single cell spans the table, no sticky class is needed.

- [ ] **Step 4: Fix the two rigid grids**

`src/app/(app)/recipes/page.tsx:247` — a two-column detail grid inside a card:

```tsx
// was: <div className="grid grid-cols-2 gap-2 text-sm">
<div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
```

`src/app/(app)/settings/users/page.tsx:654` — the access-preview checkbox grid:

```tsx
// was: <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
<div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
```

- [ ] **Step 5: Run the affected suites**

Run: `npx vitest run "src/app/(app)/settings"`
Expected: PASS — 35 tests (18 permissions, 17 users), unchanged.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint "src/app/(app)/settings/permissions/page.tsx" "src/app/(app)/recipes/page.tsx" "src/app/(app)/settings/users/page.tsx"
git add "src/app/(app)/settings/permissions/page.tsx" "src/app/(app)/recipes/page.tsx" "src/app/(app)/settings/users/page.tsx"
git commit -m "fix(responsive): use shared Table for the role matrix, relax two rigid grids"
```

---

### Task 6: `ResponsiveDialog` — Drawer on mobile, Dialog on desktop

The one place JS breakpoint switching earns its keep, and the shadcn-documented pattern. Applied to the four data-entry dialogs first, since those are the ones someone would actually reach for on a phone.

**Files:**
- Create: `src/components/ui/drawer.tsx`
- Create: `src/components/ui/responsive-dialog.tsx`
- Test: `src/components/ui/responsive-dialog.spec.tsx`
- Modify: `src/app/(app)/material-inventory/components/StockCardDialog.tsx`
- Modify: `src/app/(app)/material-inventory/components/AdjustmentsDialog.tsx`
- Modify: `src/app/(app)/inventory/components/InventoryAdjustmentsDialog.tsx`
- Modify: `src/app/(app)/production-orders/components/ProductionOrderFormDialog.tsx`

**Interfaces:**
- Consumes: `useIsMobile` (Task 1)
- Produces: `ResponsiveDialog`, `ResponsiveDialogContent`, `ResponsiveDialogHeader`, `ResponsiveDialogTitle`, `ResponsiveDialogDescription`, `ResponsiveDialogFooter` — same composition shape as `Dialog`, so converting a site is an import swap plus renaming the elements.

- [ ] **Step 1: Install vaul**

```bash
npm install vaul
```

Expected: adds `vaul` to `dependencies`. It is the drawer primitive shadcn uses; there is no local equivalent.

- [ ] **Step 2: Write the failing test**

`src/components/ui/responsive-dialog.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isMobile = { current: false };
vi.mock('@/lib/useIsMobile', () => ({ useIsMobile: () => isMobile.current }));

const {
  ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogTitle,
} = await import('./responsive-dialog');

function renderIt() {
  return render(
    <ResponsiveDialog open onOpenChange={() => {}}>
      <ResponsiveDialogContent>
        <ResponsiveDialogTitle>Record stock</ResponsiveDialogTitle>
        <p>body</p>
      </ResponsiveDialogContent>
    </ResponsiveDialog>,
  );
}

describe('ResponsiveDialog', () => {
  beforeEach(() => { isMobile.current = false; });

  it('renders the same title and body on both viewports', () => {
    renderIt();
    expect(screen.getByText('Record stock')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('renders a centred dialog on desktop', () => {
    renderIt();
    expect(screen.getByRole('dialog').className).toContain('translate-x-[-50%]');
  });

  it('renders a bottom drawer on mobile', () => {
    // A centred modal at 390px leaves almost no room for a form; the bottom
    // sheet is the near-universal convention.
    isMobile.current = true;
    renderIt();
    expect(screen.getByRole('dialog').className).not.toContain('translate-x-[-50%]');
  });

  it('keeps content accessible on mobile', () => {
    isMobile.current = true;
    renderIt();
    expect(screen.getByText('Record stock')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/ui/responsive-dialog.spec.tsx`
Expected: FAIL — `Failed to resolve import "./responsive-dialog"`

- [ ] **Step 4: Add the vaul-based `drawer.tsx`**

```tsx
'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

const Drawer = ({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = 'Drawer';

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/80', className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-xl border bg-background',
        className,
      )}
      {...props}
    >
      <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 p-4 text-center sm:text-left', className)} {...props} />
);
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose,
  DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription,
};
```

- [ ] **Step 5: Create `responsive-dialog.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useIsMobile } from '@/lib/useIsMobile';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './dialog';
import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from './drawer';

/**
 * A modal that is a centred dialog on desktop and a bottom drawer on a phone.
 *
 * This is the one place the app switches components on a breakpoint rather than
 * using a CSS class. It is justified because the two are genuinely different
 * primitives — different DOM, different focus behaviour, different gestures —
 * and because a centred modal at 390px leaves almost no room for a form.
 *
 * `useIsMobile` reports `false` during SSR and the first client render, so the
 * desktop branch renders first and React swaps it on hydration. That is fine
 * for a modal, which is closed on first paint in every case here.
 *
 * Composition mirrors `Dialog`, so converting a call site is an import swap and
 * a rename.
 */
function useModalParts() {
  const isMobile = useIsMobile();
  return isMobile
    ? { Root: Drawer, Content: DrawerContent, Header: DrawerHeader, Title: DrawerTitle, Description: DrawerDescription, Footer: DrawerFooter }
    : { Root: Dialog, Content: DialogContent, Header: DialogHeader, Title: DialogTitle, Description: DialogDescription, Footer: DialogFooter };
}

const ModalContext = React.createContext<ReturnType<typeof useModalParts> | null>(null);

function useParts() {
  const ctx = React.useContext(ModalContext);
  if (!ctx) throw new Error('ResponsiveDialog parts must be used inside <ResponsiveDialog>');
  return ctx;
}

export function ResponsiveDialog({
  children,
  ...props
}: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const parts = useModalParts();
  const { Root } = parts;
  return (
    <ModalContext.Provider value={parts}>
      <Root {...props}>{children}</Root>
    </ModalContext.Provider>
  );
}

export function ResponsiveDialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const { Content } = useParts();
  return <Content className={className}>{children}</Content>;
}

export function ResponsiveDialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const { Header } = useParts();
  return <Header className={className}>{children}</Header>;
}

export function ResponsiveDialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  const { Title } = useParts();
  return <Title className={className}>{children}</Title>;
}

export function ResponsiveDialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  const { Description } = useParts();
  return <Description className={className}>{children}</Description>;
}

export function ResponsiveDialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  const { Footer } = useParts();
  return <Footer className={className}>{children}</Footer>;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/components/ui/responsive-dialog.spec.tsx`
Expected: PASS — 4 tests

- [ ] **Step 7: Convert the four data-entry dialogs**

In each of the four files, change the import from `@/components/ui/dialog` to `@/components/ui/responsive-dialog` and rename the elements — `Dialog` → `ResponsiveDialog`, `DialogContent` → `ResponsiveDialogContent`, and so on. Do not change any props, state or handlers.

`StockCardDialog.tsx` also passes `className="max-w-2xl"` to its content; keep it — on mobile the drawer ignores `max-w-*` because it is full-width, and on desktop it still applies.

- [ ] **Step 8: Run the full frontend suite**

Run: `npx vitest run`
Expected: PASS — 303 + 1 skipped (299 after Task 3, plus 4).

- [ ] **Step 9: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint src/components/ui/drawer.tsx src/components/ui/responsive-dialog.tsx
git add package.json package-lock.json src/components/ui "src/app/(app)"
git commit -m "feat(responsive): add ResponsiveDialog and use it for the data-entry dialogs"
```

---

### Task 7: The three grid screens

`/inventory/details`, `/material-inventory`, `/production`. These keep their desktop shape. They get a sticky identity column so a scrolled row is still identifiable, and an honest notice that entry works best on a bigger screen.

**Files:**
- Create: `src/components/layout/SmallScreenNotice.tsx`
- Test: `src/components/layout/SmallScreenNotice.spec.tsx`
- Modify: `src/app/(app)/inventory/details/page.tsx`
- Modify: `src/app/(app)/material-inventory/page.tsx`
- Modify: `src/app/(app)/production/page.tsx`

**Interfaces:**
- Consumes: `Alert`, `AlertDescription` from `@/components/ui/alert`
- Produces: `SmallScreenNotice({ storageKey }: { storageKey: string })` — renders only below `md` (via `md:hidden`), dismissible, remembers dismissal in `localStorage` under `smallscreen-notice:${storageKey}`.

- [ ] **Step 1: Write the failing test**

`src/components/layout/SmallScreenNotice.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import SmallScreenNotice from './SmallScreenNotice';

describe('SmallScreenNotice', () => {
  beforeEach(() => localStorage.clear());

  it('tells the user entry works better on a larger screen', () => {
    render(<SmallScreenNotice storageKey="production" />);
    expect(screen.getByText(/larger screen/i)).toBeInTheDocument();
  });

  it('is hidden from desktop via a utility class rather than JS', () => {
    // Rendering it unconditionally and hiding with `md:hidden` keeps the server
    // and client markup identical, so there is no hydration mismatch.
    const { container } = render(<SmallScreenNotice storageKey="production" />);
    expect(container.firstElementChild?.className).toContain('md:hidden');
  });

  it('stays dismissed once dismissed', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SmallScreenNotice storageKey="production" />);

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/larger screen/i)).toBeNull();

    unmount();
    render(<SmallScreenNotice storageKey="production" />);
    expect(screen.queryByText(/larger screen/i)).toBeNull();
  });

  it('keeps dismissal separate per screen', async () => {
    const user = userEvent.setup();
    render(<SmallScreenNotice storageKey="production" />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    render(<SmallScreenNotice storageKey="material-stock" />);
    expect(screen.getByText(/larger screen/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/layout/SmallScreenNotice.spec.tsx`
Expected: FAIL — `Failed to resolve import "./SmallScreenNotice"`

- [ ] **Step 3: Create the component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * Says plainly that a spreadsheet-style screen is awkward on a phone.
 *
 * These three screens replace a printed Excel workflow and are built around
 * keyboard cell navigation, which a phone does not have. Rather than ship a
 * shrunken grid that pretends otherwise, the screen stays desktop-shaped,
 * scrolls horizontally, and says so once.
 *
 * Hidden above `md` with a utility class, not a JS breakpoint check, so server
 * and client markup match. Dismissal is read in an effect for the same reason:
 * reading localStorage during render would differ between the two.
 */
export default function SmallScreenNotice({ storageKey }: { storageKey: string }) {
  const [dismissed, setDismissed] = useState(false);
  const key = `smallscreen-notice:${storageKey}`;

  useEffect(() => {
    try {
      if (localStorage.getItem(key) === 'true') setDismissed(true);
    } catch {
      // Private browsing can throw on access; showing the notice is harmless.
    }
  }, [key]);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(key, 'true');
    } catch {
      // Not worth surfacing — the notice simply returns next visit.
    }
  };

  return (
    <div className="md:hidden">
      {!dismissed && (
        <Alert className="mb-4 flex items-start gap-2">
          <AlertDescription className="flex-1 text-xs">
            This sheet is built for keyboard entry and is easier to use on a
            larger screen. You can still scroll it sideways to read.
          </AlertDescription>
          <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={dismiss} aria-label="Dismiss notice">
            <X className="size-3.5" />
          </Button>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/layout/SmallScreenNotice.spec.tsx`
Expected: PASS — 4 tests

- [ ] **Step 5: Mount it on the three grid screens**

In each of `inventory/details/page.tsx`, `material-inventory/page.tsx` and `production/page.tsx`, add the import and render it as the first child of the page's returned fragment:

```tsx
import SmallScreenNotice from '@/components/layout/SmallScreenNotice';

// ...at the top of the returned markup:
<SmallScreenNotice storageKey="inventory-details" />   // material-stock | production
```

- [ ] **Step 6: Add sticky identity columns**

On each of those three screens, the leftmost column holds the product or material name. Add to its header cell and each body row's first cell:

```tsx
className="sticky left-0 z-10 bg-background"
```

Where a row has a highlighted state that sets its own background, use that colour on the sticky cell too — a transparent sticky cell shows the scrolling content beneath it.

- [ ] **Step 7: Run the full frontend suite**

Run: `npx vitest run`
Expected: PASS — 307 + 1 skipped.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npx tsc --noEmit
npx eslint src/components/layout/SmallScreenNotice.tsx "src/app/(app)/production/page.tsx" "src/app/(app)/material-inventory/page.tsx" "src/app/(app)/inventory/details/page.tsx"
git add src/components/layout "src/app/(app)"
git commit -m "feat(responsive): sticky identity column and small-screen notice on the grid screens"
```

---

### Task 8: Verify no screen scrolls sideways

The objective version of "does it look broken". A page whose body scrolls horizontally is the single failure this whole plan exists to prevent, and it is measurable.

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-mobile-responsive-verification.md`

**Interfaces:**
- Consumes: a dev server on `http://localhost:4000` and Playwright MCP
- Produces: a recorded pass/fail per screen per viewport

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: app on `http://localhost:4000`. Leave it running.

- [ ] **Step 2: Log in and walk every screen at 390px**

Using Playwright MCP, resize to 390x844, log in as an admin, and visit each of the 27 routes under `(app)`. On each, evaluate:

```js
({
  path: location.pathname,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
})
```

Expected: `overflow <= 0` on every screen. Any positive value is a real failure — record the path and the offending element:

```js
[...document.querySelectorAll('*')]
  .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
  .slice(0, 5)
  .map((el) => el.tagName + '.' + el.className)
```

Note: the three grid screens are expected to have an *inner* scroll container. The assertion is about the document element, not about those containers.

- [ ] **Step 3: Verify the drawer at 390px**

Confirm the hamburger appears, opens the drawer, that the drawer lists exactly the nav items the account's permissions allow, and that tapping one navigates and closes the drawer.

- [ ] **Step 4: Measure tap targets at 390px**

The spec calls for a 44px minimum hit area on icon-only controls. Measure rather than eyeball — on each screen, evaluate:

```js
[...document.querySelectorAll('button, a[href], [role="button"]')]
  .map((el) => ({ el, r: el.getBoundingClientRect() }))
  .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
  .slice(0, 10)
  .map(({ el, r }) => `${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`)
```

Expected: an empty list, or only controls inside a scrollable grid where density is deliberate. Fix anything else by adding `size-11` (44px) or padding — not by shrinking the icon.

- [ ] **Step 5: Repeat at 768px and 1280px**

At 768px the static sidebar must be visible and the hamburger gone.

At 1280px the layout must be visually equivalent to before this work, with one intended difference: the collapse toggle now sits in its own row above the brand rather than beside it, because the brand block moved into the shared `SidebarContent` while the toggle stayed desktop-only. Confirm collapse still works and still persists across a reload.

- [ ] **Step 6: Record results and commit**

Write the per-screen results into `docs/superpowers/plans/2026-09-02-mobile-responsive-verification.md`, including any screens that failed and were fixed.

```bash
git add docs/superpowers/plans/2026-09-02-mobile-responsive-verification.md
git commit -m "docs(responsive): record the three-viewport verification walk"
```

- [ ] **Step 7: Final full verification**

```bash
npx tsc --noEmit
npx jest
npx vitest run
```

Expected: 588 server tests pass; 307 frontend + 1 skipped pass; typecheck clean.

---

## Notes for the executor

**If a Sidebar or RouteGuard test fails at any point, the component is wrong, not the test.** Those 25 tests encode the RBAC behaviour that landed immediately before this work. This plan changes layout only.

**Do not run vitest from the workspace root.** It resolves a different config and fails with `describe is not defined`. Always run from `louella-web/`.

**`min-w-0` on flex children is the usual culprit** if a screen scrolls sideways after Task 3. A flex item defaults to `min-width: auto`, so a wide table stretches its parent instead of scrolling inside it.

**The design-system branch will conflict.** `feature/landing-page-ui-refresh` reworks `globals.css` and the visual language, and touches `Header.tsx`. Expect a manual merge in `Header.tsx` and `(app)/layout.tsx`.
