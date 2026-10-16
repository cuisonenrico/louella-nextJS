# Phone Count & Branch Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phone layouts (below `md`) for `/inventory/details` and `/production/orders`, a phone tab bar, a stock-value figure, and a revenue panel key that hides revenue from managers.

**Architecture:** Data and rules move out of the two page files into hooks (`useInventoryDay`, `useOrderForm`) and pure functions (`rowFigures`, `countQueue`, `orderDraft`). Each page picks a desktop view (today's markup) or a phone view with `useIsMobile()`. Phone count saves go through a per-user `localStorage` queue drained into the existing `PATCH /inventory/bulk`.

**Tech Stack:** Next.js 16 App Router (client pages), TanStack Query, shadcn/ui (`ui/sheet` bottom variant), Vitest + Testing Library, Playwright, Prisma SQL migration.

**Spec:** `docs/superpowers/specs/2026-10-16-mobile-count-and-orders-design.md`

## Global Constraints

- Phone views only below `md` (`useIsMobile()` / `MOBILE_BREAKPOINT_PX = 768`); desktop markup unchanged except §6 of the spec (Stock ₱ column, revenue gating).
- No backend code changes. The only server-side artifact is the SQL migration registering `inventory-history:revenue`.
- **Never run `prisma migrate` / `prisma:deploy` locally — `.env` is the production database.** The migration is applied by the user. E2E runs only against `.env.e2e`.
- Touch targets ≥ 44px on phone views; list rows 48px.
- "Today" in new code comes from `manilaToday()` (`src/lib/manilaDate.ts`), never `dayjs()` / `new Date()` getters.
- Every `localStorage` access in try/catch; render correctly without it.
- Storage keys exactly: `louella:count-queue:v1:<userId>` and `louella:order-draft:v1:<userId>:<branchId>:<date>:<orderId|new>`.
- Copy fixed by the spec: "✓ matches order", "Different count?", "N short" / "N over", "Ordered N", "Save & next ›", "Adjust…", "Fill all from suggestions", "Save draft", "Finalize", "● N waiting for signal", "N couldn't save", "Needs signal", "Restored your unsaved order from <h:mm A> · Discard", "Can send up to N", "N counts haven't reached the server yet".
- Adjustment terms on phone are the desktop ones: Pull In / Pull Out / Anomaly; Pull Out + branch = transfer.
- Every user-visible change ships with its Playwright test in the same task (AGENTS.md). Read `.claude/skills/adding-e2e-coverage/SKILL.md` and `e2e/README.md` before the first e2e step.

## Review Focus

1. **Day or branch changed while counts are queued** — queued rows for the other day must keep sending and must not overlay the new day's rows (they are keyed by inventory id, so a correct overlay only matches ids present). Test in Task 4.
2. **Two tabs on one phone draining the same queue** — each drain must re-read storage before settling so a tab never deletes an entry the other tab revised. Test in Task 4 (`settle` against a fresher stored revision).
3. **Stepper fed junk** — empty input, "-3", "1e3", "07", paste of "12 pcs": value stays an integer ≥ 0; "−" at 0 stays 0; empty leftover stays "uncounted" rather than 0. Test in Task 5.
4. **A product with no row for the day** — the phone list must offer "Initialize N rows" and not let the sheet open on a non-existent inventory id. Test in Task 7.
5. **Finalize on a phone form with unsaved edits** — Finalize must save the items first, then change status; if the save fails, the status is not changed and the draft stays. Test in Task 9.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/migrations/20261016100000_inventory_revenue_panel_key/migration.sql` | Register the new key |
| `src/lib/rbac/features.ts` | `revenue` panel on `inventory-history`; role defaults |
| `src/lib/inventory/rowFigures.ts` | Per-row figures (uncounted, on hand, sold, revenue, stock value) |
| `src/app/(app)/inventory/hooks/useInventoryDay.ts` | Everything the details page holds today |
| `src/app/(app)/inventory/components/InventoryDesktop.tsx` | Today's page markup, moved |
| `src/app/(app)/inventory/details/page.tsx` | Thin: Suspense + `?view=cash` + desktop/phone switch |
| `src/lib/mobile/countQueue.ts` | Pure queue ops + store |
| `src/lib/mobile/useCountQueue.ts` | Drain, triggers, backoff |
| `src/components/mobile/{Stepper,ProductSheet,SyncChip,PhoneTabBar}.tsx` | Phone primitives |
| `src/app/(app)/inventory/components/phone/{InventoryPhone,CountList,CountSheet,DeliveryBlock,AdjustSheet,IncomingTransfers}.tsx` | Phone count |
| `src/app/(app)/production-orders/lib/orderedByProduct.ts` | Σ finalized order items per product + delivery status |
| `src/app/(app)/production-orders/hooks/useOrderForm.ts` | Form state/save, shared by dialog and phone form |
| `src/lib/mobile/orderDraft.ts` | Draft persistence |
| `src/app/(app)/production-orders/components/phone/{OrdersPhone,OrderCard,PhoneOrderForm}.tsx` | Phone orders |
| `e2e/pages/phone-count.page.ts`, `e2e/pages/phone-orders.page.ts` | Phone page objects |
| `e2e/full/phone/{phone-count,phone-transfers,phone-orders}.spec.ts` | Phone e2e |

---

### Task 1: `inventory-history:revenue` panel key

**Files:**
- Create: `prisma/migrations/20261016100000_inventory_revenue_panel_key/migration.sql`
- Modify: `src/lib/rbac/features.ts` (inventory-history `panels`, `ROLE_DEFAULTS`), `prisma/seed-features.sql`
- Test: `src/lib/rbac/features.spec.ts`

**Interfaces:**
- Produces: permission key `'inventory-history:revenue'` (usable as `useCan('inventory-history:revenue')`).

- [ ] **Step 1: Write the failing tests** in `features.spec.ts`: add `'20261016100000_inventory_revenue_panel_key'` to the `migration` dir list in "database registration", and a new block:

```ts
describe('inventory revenue panel', () => {
  it('is a presentation panel of inventory-history', () => {
    const f = FEATURES.find((x) => x.key === 'inventory-history')!;
    expect(f.panels).toContainEqual(expect.objectContaining({ id: 'revenue', sensitivity: 'presentation' }));
  });
  it.each(['VIEWER', 'INVENTORY', 'ADMIN'] as const)('is granted to %s', (role) => {
    expect(ROLE_DEFAULTS[role]).toContain('inventory-history:revenue');
  });
  it('is not granted to MANAGER', () => {
    expect(ROLE_DEFAULTS.MANAGER).not.toContain('inventory-history:revenue');
  });
});
```

VIEWER does not hold `inventory-history` today; granting the child there is harmless (parent rule) and keeps "every role except MANAGER" literal.

- [ ] **Step 2: Run** `npx vitest run src/lib/rbac/features.spec.ts` — Expected: FAIL (missing migration file, missing panel).
- [ ] **Step 3: Implement.** Panel `{ id: 'revenue', label: 'Revenue figures', description: 'Revenue column and revenue cards on the inventory sheet', sensitivity: 'presentation' }`. Add the key to VIEWER and INVENTORY defaults (ADMIN gets it via `PERMISSION_KEYS`). Migration in the format of `20261001110000_branch_cash_feature_keys` (one row, `ON CONFLICT (key) DO UPDATE`). Same row in `prisma/seed-features.sql`.
- [ ] **Step 4: Run** `npx vitest run src/lib/rbac` and `npx jest src/server/common/guards/rbac-matrix.spec.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rbac): inventory-history:revenue panel key (not granted to managers)`. Tell the user the migration must be applied to production (`npm run prisma:deploy`) by them; do not run it.

---

### Task 2: Extract `rowFigures` and `useInventoryDay` (no visible change)

**Files:**
- Create: `src/lib/inventory/rowFigures.ts`, `src/lib/inventory/rowFigures.spec.ts`, `src/app/(app)/inventory/hooks/useInventoryDay.ts`, `src/app/(app)/inventory/components/InventoryDesktop.tsx`
- Modify: `src/app/(app)/inventory/details/page.tsx`, `src/app/(app)/inventory/components/InventoryTableRow.tsx`

**Interfaces:**
- Produces:
  - `type CountFields = { delivery?: number; leftover?: number; reject?: number }` (exported from `rowFigures.ts`)
  - `rowFigures(inv: Inventory, pending: CountFields | undefined, product: Product | undefined): RowFigures` where `RowFigures = { uncounted: boolean; delivery: number; leftover: number; reject: number; adjSum: number; totalStock: number; sold: number; price: number; revenue: number; stockValue: number }`
  - `useInventoryDay(): InventoryDay` returning everything the page uses today: `today, dateMode, draftFrom, draftTo, filterDateFrom, filterDateTo, filterBranch, selectedBranchId, isRange, branches, products, productById, invQuery, summaryQuery, rows, displayRows, rowsByType, uninitializedCount, bulkCreateMutation, pendingUpdates, handleCellChange, discardPending, savePendingMutation, isEditable, canAdjust, canEditInventory, canCreateInventory, canImport, canSeeCash, commitDates, changeBranch, stepDate, handleDateModeChange, setDraftFrom, setDraftTo, adjRow, setAdjRow, discardDialog, confirmDiscard` — names identical to today's locals so `InventoryDesktop` is a move, not a rewrite.

- [ ] **Step 1: Write the failing test** `rowFigures.spec.ts`, mirroring `InventoryTableRow`'s current maths:

```ts
const inv = (o: Partial<Inventory> = {}): Inventory => ({ id: 1, branchId: 1, productId: 1, createdById: null, quantity: 10, delivery: 30, leftover: 0, reject: 2, date: '2026-10-16', notes: null, createdAt: '', updatedAt: '', adjustments: [], effectivePrice: 5, leftoverCountedAt: '2026-10-16T10:00:00Z', ...o });

it('counted row: sold = qty + delivery + adj − leftover − reject', () => {
  const f = rowFigures(inv({ leftover: 8 }), undefined, undefined);
  expect(f).toMatchObject({ uncounted: false, totalStock: 40, sold: 30, revenue: 150, stockValue: 200 });
});
it('uncounted row derives leftover = on hand − reject and sells nothing', () => {
  const f = rowFigures(inv({ leftoverCountedAt: null }), undefined, undefined);
  expect(f).toMatchObject({ uncounted: true, leftover: 38, sold: 0, revenue: 0 });
});
it('a pending leftover counts the row', () => {
  const f = rowFigures(inv({ leftoverCountedAt: null }), { leftover: 5 }, undefined);
  expect(f).toMatchObject({ uncounted: false, leftover: 5, sold: 33 });
});
it('a pending delivery changes on hand and stock value', () => {
  expect(rowFigures(inv(), { delivery: 20 }, undefined)).toMatchObject({ totalStock: 30, stockValue: 150 });
});
it('falls back to product price when effectivePrice is missing', () => {
  const p = { id: 1, price: 4 } as Product;
  expect(rowFigures(inv({ effectivePrice: undefined }), undefined, p).price).toBe(4);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/inventory/rowFigures.spec.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `rowFigures` with `computeAdjSum/computeTotalStock/computeSold` from `src/lib/inventory/metrics.ts`; `stockValue = totalStock * price`; `price = inv.effectivePrice ?? product?.price ?? 0`. Make `InventoryTableRow` call it instead of its inline maths.
- [ ] **Step 4: Move** the page body into `useInventoryDay` (state, queries, mutations, callbacks) and `InventoryDesktop` (the JSX, unchanged, including `SmallScreenNotice` for now). `page.tsx` renders `<InventoryDesktop day={useInventoryDay()} />`.
- [ ] **Step 5: Run** `npm run test:web` and `npm run lint` — Expected: PASS. Then `npm run e2e:db` + `npm run e2e -- e2e/full/inventory-sheet.spec.ts e2e/smoke/inventory-sheet.spec.ts --project=desktop-chromium` — Expected: PASS unchanged (this task has no visible change).
- [ ] **Step 6: Commit** `refactor(inventory): extract rowFigures and useInventoryDay`.

---

### Task 3: Stock ₱ column and revenue gating (desktop)

**Files:**
- Modify: `src/app/(app)/inventory/hooks/useInventoryColumns.ts`, `InventoryTableRow.tsx`, `InventoryTypeTables.tsx`, `InventorySummaryPanel.tsx`, `InventoryDesktop.tsx`, `e2e/pages/inventory-sheet.page.ts`
- Test: `useInventoryColumns.spec.ts`, `e2e/full/inventory-sheet.spec.ts`

**Interfaces:**
- Consumes: `rowFigures` (Task 2), `useCan('inventory-history:revenue')` (Task 1).
- Produces: `useInventoryColumns({ filterBranch, isRange, showRevenue }: { …; showRevenue: boolean })`; `InventorySummaryPanel` prop `showRevenue: boolean`.

- [ ] **Step 1: Failing unit tests** in `useInventoryColumns.spec.ts`: with `filterBranch: '1', isRange: false, showRevenue: true` the header names equal `['Product','Prev. Leftover','Delivery','Adjustments','Total Stock','Stock ₱','Leftover','Reject','Sold','Revenue']`; with `showRevenue: false` the same list without `'Revenue'`; with `isRange: true` neither `'Total Stock'` nor `'Stock ₱'` appears (on hand is per day).
- [ ] **Step 2: Failing e2e tests** in `e2e/full/inventory-sheet.spec.ts`:
  - `'admin sees Stock ₱ and revenue'`: world with 1 product; `sheet.open`, `enter(p, { delivery: 10, leftover: 2 })`; `sheet.expectNumber(p, 'Stock ₱', 10 * p.price)` (format through `e2e/support/format.ts`); `columnheader 'Revenue'` visible; text `Total Revenue` visible.
  - `'a manager sees stock value but no revenue'`: `managerPage(browser, world)`, open `/inventory/details` the way the existing scoped-manager regression test does; `columnheader 'Stock ₱'` visible; `columnheader 'Revenue'` count 0; `getByText('Total Revenue')` count 0; `columnheader 'Sold'` visible.
  - Update `COLUMNS` in `inventory-sheet.page.ts`: insert `'Stock ₱'` after `'Total Stock'`, and make the header-order check in `open()` compare only the columns that are present, in order (Revenue may be absent).
- [ ] **Step 3: Run** `npx vitest run "src/app/(app)/inventory/hooks"` — Expected: FAIL.
- [ ] **Step 4: Implement.** Column `{ field: 'stockValue', headerName: 'Stock ₱', align: 'right', width: 'w-[100px]' }` after Total Stock (not in range mode); row cell `₱{stockValue.toLocaleString()}`; Revenue column and cell only when `showRevenue`. `InventorySummaryPanel` hides the revenue cards and the top-product ₱ line when `!showRevenue` (sold count stays).
- [ ] **Step 5: Run** vitest (PASS), then `npm run e2e -- e2e/full/inventory-sheet.spec.ts e2e/smoke/inventory-sheet.spec.ts` — Expected: PASS on both desktop and tablet projects.
- [ ] **Step 6: Commit** `feat(inventory): stock value column; hide revenue without inventory-history:revenue`.

---

### Task 4: Count queue

**Files:**
- Create: `src/lib/mobile/countQueue.ts`, `src/lib/mobile/countQueue.spec.ts`, `src/lib/mobile/useCountQueue.ts`, `src/lib/mobile/useCountQueue.spec.tsx`

**Interfaces:**
- Consumes: `CountFields` (Task 2), `inventoryApi.updateBulk(items: InventoryBulkUpdateItem[])`.
- Produces:
  - `type QueueEntry = CountFields & { inventoryId: number; rev: number; error?: string }`
  - `interface CountQueueStore { read(): QueueEntry[]; write(entries: QueueEntry[]): void; persistent: boolean }`
  - `createCountStore(userId: number, storage?: Storage): CountQueueStore` — key `louella:count-queue:v1:<userId>`; memory fallback with `persistent: false` when storage throws.
  - `enqueue(entries: QueueEntry[], inventoryId: number, fields: CountFields): QueueEntry[]` — merge fields over the existing entry, `rev + 1`, clear `error`.
  - `settle(stored: QueueEntry[], sent: QueueEntry[]): QueueEntry[]` — drop each stored entry whose id **and rev** match a sent one.
  - `markFailed(entries: QueueEntry[], inventoryId: number, message: string): QueueEntry[]`
  - `discard(entries: QueueEntry[], inventoryId: number): QueueEntry[]`
  - `classifyError(err: unknown): 'retry' | 'auth' | 'reject'` — no response / 5xx / 429 → retry; 401 → auth; other 4xx → reject.
  - `BACKOFF_MS = [2000, 5000, 15000, 30000] as const` (last value repeats).
  - `useCountQueue(userId: number | null): { entries: QueueEntry[]; waiting: QueueEntry[]; failed: QueueEntry[]; overlay: Map<number, CountFields>; save(inventoryId: number, fields: CountFields): void; discard(inventoryId: number): void; sending: boolean; persistent: boolean }`

- [ ] **Step 1: Failing pure tests** (`countQueue.spec.ts`):

```ts
it('latest values win and rev increments', () => {
  let q = enqueue([], 7, { leftover: 3 });
  q = enqueue(q, 7, { reject: 1 });
  expect(q).toEqual([{ inventoryId: 7, leftover: 3, reject: 1, rev: 2 }]);
});
it('settle keeps an entry revised during the request', () => {
  const sent = enqueue([], 7, { leftover: 3 });           // rev 1
  const stored = enqueue(sent, 7, { leftover: 4 });       // rev 2, written by another tab
  expect(settle(stored, sent)).toEqual(stored);
});
it('settle removes entries sent unchanged', () => {
  const q = enqueue(enqueue([], 7, { leftover: 3 }), 8, { reject: 2 });
  expect(settle(q, q)).toEqual([]);
});
it('enqueue clears a previous error', () => {
  const q = markFailed(enqueue([], 7, { leftover: 3 }), 7, 'Bad value');
  expect(enqueue(q, 7, { leftover: 2 })[0].error).toBeUndefined();
});
it.each([[undefined, 'retry'], [500, 'retry'], [429, 'retry'], [401, 'auth'], [400, 'reject'], [403, 'reject'], [404, 'reject']])(
  'classifies status %s as %s', (status, kind) => {
    const err = status ? { isAxiosError: true, response: { status } } : { isAxiosError: true, request: {} };
    expect(classifyError(err)).toBe(kind);
  });
it('store is per user and survives a throwing storage', () => {
  const ls = new Map<string, string>();
  const storage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v) } as Storage;
  createCountStore(1, storage).write(enqueue([], 7, { leftover: 1 }));
  expect(createCountStore(2, storage).read()).toEqual([]);
  expect([...ls.keys()]).toEqual(['louella:count-queue:v1:1']);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
  const mem = createCountStore(1, broken);
  mem.write(enqueue([], 7, { leftover: 1 }));
  expect(mem.persistent).toBe(false);
  expect(mem.read()).toHaveLength(1);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/mobile` — Expected: FAIL.
- [ ] **Step 3: Implement `countQueue.ts`.**
- [ ] **Step 4: Failing hook tests** (`useCountQueue.spec.tsx`, `vi.mock('@/lib/apiServices')`, fake timers, QueryClientProvider wrapper):
  - `save` sends one `updateBulk` call with `[{ id: 7, leftover: 3 }]` and empties `waiting` on success.
  - network error → entry stays in `waiting`; after `advanceTimersByTime(2000)` it is re-sent.
  - 400 on a 2-row batch → re-sent one row at a time; the row that 400s alone lands in `failed` with the server message (via `extractError`), the other is settled.
  - `window.dispatchEvent(new Event('online'))` triggers a send.
  - entries for inventory ids not on screen are still sent (Review Focus 1).
- [ ] **Step 5: Implement `useCountQueue`.** One drain in flight (ref guard). Drain = read store → send waiting → on success `store.write(settle(store.read(), sent))` (re-read: Review Focus 2) and invalidate `['inventory']`, `['inventory-summary']`, `BRANCH_CASH_KEY`. On `reject` with >1 rows, send each row alone and `markFailed` the ones rejected. On `auth`, stop and keep entries. On `retry`, schedule the next `BACKOFF_MS` step; reset the step after a success. Triggers: after `save`, `online`, `visibilitychange` to visible, mount, `storage` event (re-read entries). `overlay` = map of waiting+failed entries' fields.
- [ ] **Step 6: Run** `npx vitest run src/lib/mobile` — Expected: PASS.
- [ ] **Step 7: Commit** `feat(mobile): offline-tolerant count save queue`.

---

### Task 5: Phone primitives

**Files:**
- Create: `src/components/mobile/Stepper.tsx`, `ProductSheet.tsx`, `SyncChip.tsx`, and `Stepper.spec.tsx`, `SyncChip.spec.tsx`

**Interfaces:**
- Produces:
  - `<Stepper label: string; value: number | null; onChange(v: number | null): void; min?: number /* 0 */; placeholder?: string /* '–' */; disabled?: boolean />` — input `inputMode="numeric"`, `aria-label={label}`; buttons `aria-label="Decrease <label>"` / `"Increase <label>"`, 44px.
  - `<ProductSheet open: boolean; onOpenChange(o: boolean): void; title: string; subtitle?: string; children; footer: ReactNode />` — `ui/sheet` `side="bottom"`, `SheetTitle` = title (dialog accessible name).
  - `<SyncChip waiting: number; failed: QueueEntry[]; persistent: boolean; onEdit(id: number): void; onDiscard(id: number): void; productName(inventoryId: number): string />` — `role="status"`. Text: "● Saved" / "● N waiting for signal" / "N couldn't save"; tapping the failed state opens a popover listing "<product>: <error>" with Edit and Discard; when `!persistent` it adds "Kept only until this page closes".

- [ ] **Step 1: Failing tests.** Stepper (Review Focus 3) keeps digits only: typing `'-3'` → `onChange(3)`, `'1e3'` → 13, `'07'` → 7, `'12 pcs'` → 12; clearing the input → `onChange(null)`; "Decrease" at 0 → `onChange(0)`; "Increase" from `null` → `onChange(1)`. SyncChip: renders each of the three texts; Discard calls `onDiscard(id)`.
- [ ] **Step 2: Run** `npx vitest run src/components/mobile` — Expected: FAIL.
- [ ] **Step 3: Implement** the three components with shadcn `Button`, `Input`, `Sheet`, `Popover` (add via shadcn CLI if `popover` is missing — read the shadcn SKILL.md first).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): stepper, product sheet, sync chip`.

---

### Task 6: Phone tab bar, cash view, phone e2e project

**Files:**
- Create: `src/components/mobile/PhoneTabBar.tsx`, `PhoneTabBar.spec.tsx`, `e2e/full/phone/shell.spec.ts`
- Modify: `src/components/layout/AppShell.tsx`, `src/app/(app)/inventory/details/page.tsx`, `playwright.config.ts`, `e2e/fixtures/world.ts`, `e2e/README.md`

**Interfaces:**
- Produces: `<PhoneTabBar onOpenMore(): void />`; `managerPage(browser, world, options?: BrowserContextOptions)`; Playwright project `phone-chromium`.

- [ ] **Step 1: Failing unit test** (`PhoneTabBar.spec.tsx`, mock `useCan` + `usePathname` + pending-transfers query): with all keys shows Count/Orders/Cash/More linking to `/inventory/details`, `/production/orders`, `/inventory/details?view=cash`; without `branch-cash` no Cash tab; two pending transfers with `direction: 'incoming', canRespond: true` and one outgoing → badge "2"; container has class `md:hidden`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Fixed bottom bar, `md:hidden print:hidden`, safe-area padding; `AppShell` renders it with `onOpenMore={() => setDrawerOpen(true)}` and `main` gets `pb-24 md:pb-6`. Badge query: `[...PENDING_TRANSFERS_KEY, 'all']` with `enabled: useCan('inventory-adjustments')`.
- [ ] **Step 4: `?view=cash`.** In `details/page.tsx` read `useSearchParams()` inside a `<Suspense>` boundary (check `node_modules/next/dist/docs` for the Next 16 rule first). `view=cash` renders a day bar + `<BranchCashPanel branchId date />` for the hook's selected branch (default: `user.branchId ?? branches[0]?.id`) and `manilaToday()`.
- [ ] **Step 5: Playwright project.** `{ name: 'phone-chromium', use: { ...devices['Pixel 7'] }, testMatch: /full\/phone\/.*\.spec\.ts/ }`; add `/full\/phone\//` to `testIgnore` of the desktop and tablet projects (tablet's becomes an array with the payroll regex). `managerPage` passes `options` to `browser.newContext` (phone specs pass `devices['Pixel 7']`, since `browser.newContext` does not inherit the project's `use`).
- [ ] **Step 6: Failing e2e** `e2e/full/phone/shell.spec.ts`: as the world manager on a phone, `/inventory/details` shows the tab bar; tapping Orders lands on `/production/orders`; Cash shows the branch-cash panel; More opens the navigation sheet. On desktop (separate assertion in the existing `e2e/smoke/route-sweep.spec.ts` or a desktop spec) the tab bar is not visible.
- [ ] **Step 7: Run** `npm run e2e -- e2e/full/phone/shell.spec.ts --project=phone-chromium` — PASS. Add `e2e/routes.ts` entry if the sweep needs `?view=cash` (it is the same route; likely no change). Document the phone project in `e2e/README.md`.
- [ ] **Step 8: Commit** `feat(mobile): phone tab bar, cash view, phone e2e project`.

---

### Task 7: Phone count view

**Files:**
- Create: `src/app/(app)/inventory/components/phone/InventoryPhone.tsx`, `CountList.tsx`, `CountSheet.tsx`, `DeliveryBlock.tsx`, `IncomingTransfers.tsx`; `src/app/(app)/production-orders/lib/orderedByProduct.ts` + `.spec.ts`; `e2e/pages/phone-count.page.ts`; `e2e/full/phone/phone-count.spec.ts`
- Modify: `src/app/(app)/inventory/details/page.tsx`; remove `SmallScreenNotice` from `InventoryDesktop.tsx`

**Interfaces:**
- Consumes: `useInventoryDay` (Task 2), `rowFigures` (2), `useCountQueue` (4), primitives (5), `productionOrdersApi.byDate(date, branchId)`.
- Produces:
  - `orderedByProduct(orders: ProductionOrder[]): Map<number, number>` — Σ `item.yield` over `status === 'FINALIZED'` orders only.
  - `deliveryStatus(delivery: number, ordered: number | undefined): { kind: 'none' } | { kind: 'match' } | { kind: 'short'; by: number } | { kind: 'over'; by: number }`

- [ ] **Step 1: Failing unit tests** (`orderedByProduct.spec.ts`): two finalized orders with Pandesal 100 and 50 plus a draft with 30 → 150; cancelled ignored; `deliveryStatus(22, 24)` → `{ kind: 'short', by: 2 }`; `(27, 24)` → over 3; `(24, 24)` → match; `(5, undefined)` → none.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.**
- [ ] **Step 4: Page object** `phone-count.page.ts` with: `open(date?)` (goto, wait for the branch/date inventory GET like `InventorySheet.open`), `initialize()`, `row(product)` (button named by product), `openProduct(product)`, `set(field: 'Leftover' | 'Reject' | 'Delivery received', n)`, `differentCount()`, `saveAndNext()`, `sync()` (the `role=status` locator).
- [ ] **Step 5: Failing e2e** `phone-count.spec.ts` (phone manager via `managerPage(browser, world, devices['Pixel 7'])`, product rows created by tapping Initialize):
  - `'counts a product through the sheet'`: Initialize; open product 1; set Leftover 4, Reject 1; Save & next → the sheet now shows product 2's name; `api.get` the branch/date inventory → product 1 has `leftover 4, reject 1`, `leftoverCountedAt` not null; sync shows "● Saved".
  - `'delivery matching a finalized order, then corrected'`: create and finalize an order via `api` for product 1 qty 24; open product 1 → "✓ matches order"; Different count? → set Delivery received 22 → text "2 short" and "Ordered 24"; Save & next → API delivery 22.
  - `'stock value and no revenue for a manager'`: after a delivery of 10, the row shows `₱` of `10 * price` (format helper); page has no text matching `/revenue/i` and no `₱` beside Sold in the sheet.
  - `'a count saved without signal is sent when the signal returns'`: `context.setOffline(true)`; set Leftover 3; Save & next; sync shows "1 waiting for signal"; `setOffline(false)`; sync shows "● Saved"; API leftover 3.
  - `'a queued count survives a reload'`: `page.route('**/api/v1/inventory/bulk', r => r.abort())`; save Leftover 6; reload; the row shows 6; `page.unroute(...)`; trigger `online` (`page.evaluate(() => dispatchEvent(new Event('online')))`); API leftover 6.
  - `'a rejected count can be discarded'`: route the bulk PATCH to fulfil 400 `{ message: 'Bad value' }`; save; sync shows "1 couldn't save"; open it → "Bad value"; Discard → "● Saved" and the row shows the server value.
  - `'uninitialized products offer Initialize, not the sheet'` (Review Focus 4): before Initialize, the list shows "Initialize N rows" and no product row buttons.
- [ ] **Step 6: Implement.**
  - `page.tsx`: `useIsMobile() ? <InventoryPhone day={day} /> : <InventoryDesktop day={day} />` (cash view from Task 6 takes precedence).
  - `InventoryPhone`: forces single-date mode; selects `user.branchId ?? branches[0]?.id` when `filterBranch === ''`; admin gets a branch `Select` in the header area; day bar ‹ / Today / › via `stepDate` and `commitDates(manilaToday(), manilaToday())`; header "N of M counted" (counted = `!rowFigures(...).uncounted`); `SyncChip`; `IncomingTransfers` (reuse `PendingTransfersPanel`'s query and mutations — extract them into `usePendingTransfers(branchId)` in that file, used by both); Initialize block when `uninitializedCount > 0` (same condition as desktop); `CountList`.
  - `CountList`: grouped by type in `PRODUCT_TYPE_ORDER`; each row a 48px `button` with name, on hand, `₱stockValue`, Left (`–` + tint when uncounted), Rej, Sold; adjustment tag (`+N`/`−N`) when `adjSum !== 0`. Figures from `rowFigures(inv, queue.overlay.get(inv.id), product)`.
  - `CountSheet` in `ProductSheet`: title = product name, subtitle "n of M"; `DeliveryBlock`; "Open X + Deliv Y (+ adj Z) = On hand T · ₱V"; Leftover and Reject `Stepper`s (leftover starts `null` when uncounted); "Sold S" (+ " · ₱R" only with `inventory-history:revenue`); footer "Adjust…" (with `inventory-adjustments:create`; opens Task 8's sheet) and "Save & next ›" → `queue.save(inv.id, changedFields)` then open the next row in list order (close after the last). Read-only (no steppers, no Save) without `inventory-history:edit`.
  - `DeliveryBlock`: ordered from `orderedByProduct` of `useQuery(['production-orders', date, branchId])` (enabled with `useCan('production-orders')`); `deliveryStatus` drives "✓ matches order" / "Different count?" → `Stepper` labelled "Delivery received" + "Ordered N" + "N short|over" + Undo (restore ordered). With `kind: 'none'`: figure + "Edit".
- [ ] **Step 7: Run** `npm run e2e -- e2e/full/phone/phone-count.spec.ts --project=phone-chromium` and the desktop inventory specs — PASS. `npm run test:web`, `npm run lint` — PASS.
- [ ] **Step 8: Commit** `feat(inventory): phone count view with queued saves`.

---

### Task 8: Phone adjust sheet

**Files:**
- Create: `src/app/(app)/inventory/components/phone/AdjustSheet.tsx`, `e2e/full/phone/phone-transfers.spec.ts`
- Modify: `InventoryAdjustmentsDialog.tsx` (extract its mutations into `useInventoryAdjustments(inventory, branches)` exported from that file), `CountSheet.tsx`, `e2e/pages/phone-count.page.ts`

**Interfaces:**
- Consumes: `useInventoryAdjustments` → `{ create(type, value, notes), transfer(toBranchId, value, notes), remove(id), isPending, error, canCreate, canTransfer, canDelete }`.

- [ ] **Step 1: Failing e2e** `phone-transfers.spec.ts` (two worlds = two branches, two phone managers):
  - `'a pull-out to another branch is accepted from the receiving phone'`: sender counts nothing yet; delivery 10 via api; sender opens product → Adjust… → Pull Out → To branch = receiver branch → shows "Can send up to 10" → set 4 → Send; sender row tag "−4"; receiver's Count tab shows badge "1" and the incoming card "4 <product> · from <sender>"; Accept → receiver row on hand includes +4 (API: PULL_IN 4 on the receiver's row).
  - `'Pull In and Anomaly are recorded with a note'`: Pull In 3 with note "found tray" → API adjustment `PULL_IN 3` with that note.
  - `'without signal the submit says Needs signal'`: `setOffline(true)` → Adjust… → Pull In → button text "Needs signal", disabled.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `AdjustSheet`: segmented Pull In / Pull Out / Anomaly (`ToggleGroup`), quantity `Stepper`, note `Input`; "To branch" `Select` only for Pull Out with `canTransfer` (other active branches); with a branch chosen show "Can send up to N" where N = on hand − reject − (counted leftover or 0), and "Leaves your count now. <Branch> gets it once they accept."; submit label "Send N" for a transfer, "Add" otherwise, "Needs signal" + disabled while `navigator.onLine === false` (subscribe to `online`/`offline`); today's adjustments for the row below, Cancel on a pending transfer only with `canDelete`.
- [ ] **Step 4: Run** the spec + `e2e/full/transfers.spec.ts` (desktop, unchanged behaviour) — PASS.
- [ ] **Step 5: Commit** `feat(inventory): phone adjustments and transfers`.

---

### Task 9: Phone Branch Orders

**Files:**
- Create: `src/app/(app)/production-orders/hooks/useOrderForm.ts`, `src/lib/mobile/orderDraft.ts` + `.spec.ts`, `src/app/(app)/production-orders/components/phone/OrdersPhone.tsx`, `OrderCard.tsx`, `PhoneOrderForm.tsx`, `e2e/pages/phone-orders.page.ts`, `e2e/full/phone/phone-orders.spec.ts`
- Modify: `ProductionOrderFormDialog.tsx` (use `useOrderForm`), `src/app/(app)/production-orders/page.tsx` (switch views; extract status/delete mutations + confirm dialogs into a `useOrderActions()` hook in the page folder, used by both views)

**Interfaces:**
- Produces:
  - `useOrderForm({ open, editTarget, filterDate, activeBranchId, activeProducts }): { items: Map<number, number>; setItem(id: number, qty: number): void; replaceItems(m: Map<number, number>): void; notes; setNotes; branchId; setBranchId; suggestPeriod; setSuggestPeriod; suggestionByProduct: Map<number, ProductionSuggestion>; suggestionsQuery; applyAll(): void; productsByType: Map<ProductType, Product[]>; total: number; save(): Promise<ProductionOrder>; saving: boolean; error: string }` — same reset-on-open and idempotency behaviour as the dialog today.
  - `orderDraftKey(p: { userId: number; branchId: number; date: string; orderId: number | null }): string` → `louella:order-draft:v1:<userId>:<branchId>:<date>:<orderId|new>`
  - `saveOrderDraft(key, d: { items: [number, number][]; notes: string; savedAt: string }, storage?)`, `loadOrderDraft(key, storage?): OrderDraft | null`, `clearOrderDraft(key, storage?)`.

- [ ] **Step 1: Failing unit tests** `orderDraft.spec.ts`: key format for new and existing orders; save→load round-trip; corrupt JSON → `null`; throwing storage → `load` returns `null`, `save` does not throw.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** `orderDraft.ts`, then `useOrderForm` (moved from the dialog; dialog behaviour unchanged — run `e2e/full/production-orders.spec.ts` desktop to confirm).
- [ ] **Step 4: Failing e2e** `phone-orders.spec.ts` (phone manager; suggestions need sales history — seed yesterday's inventory for the products via api so `prev-day` suggestions exist):
  - `'fill from suggestions, adjust, finalize'`: Orders tab → ＋ New order → Fill all from suggestions → product 1's stepper equals its suggestion → Increase once → Save draft → card "PO #<id>" with Draft chip → Finalize (confirm) → Finalized chip; Count tab → product 1 sheet shows "✓ matches order" (delivery = suggestion + 1).
  - `'an unsaved order is restored after a reload'`: New order → set product 1 to 7 → reload → New order → "Restored your unsaved order from" visible and product 1 = 7; Discard → product 1 = 0.
  - `'Finalize saves edits first and keeps the draft when the save fails'` (Review Focus 5): open an existing draft (api-created), change product 1, route `PATCH **/production-orders/*` to 500 → Finalize → error toast, card still Draft, reopen → restored value present.
  - `'Cancel and Delete live under the menu'`: on a draft card, buttons "Edit" and "Finalize" visible; "Delete" visible only after opening "More actions".
- [ ] **Step 5: Implement.**
  - `OrdersPhone`: day bar on `filterDate` (opens on today, uses existing state), admin branch `Select`, one-line stats ("N orders · N pcs · N drafts"), the "all drafts" alert, `OrderCard` list, floating "＋ New order"; form open → render `PhoneOrderForm` full screen instead of the list.
  - `OrderCard`: "PO #id", status chip, `h:mm A`, products with qty, total pcs, first 3 items as tags + "+N more"; drafts: Edit / Finalize buttons (each behind its permission) and a ⋯ `DropdownMenu` ("More actions") with Cancel / Delete, all reusing `useOrderActions`' confirm dialogs.
  - `PhoneOrderForm`: header "New order · <branch>" / "Edit PO #id", suggestions period `Select`, "Fill all from suggestions"; rows by type: name + "avg sold N/day", chip "↑ N" (sets qty), `Stepper` labelled by product name; notes at the bottom; bottom bar total pcs + "N products", Save draft, and Finalize when editing a draft. Finalize = `await form.save()` then status `FINALIZED` via `useOrderActions`; on save failure stop. Draft: on every change `saveOrderDraft` (debounced 500ms); on open, `loadOrderDraft` → `replaceItems` + banner "Restored your unsaved order from <h:mm A> · Discard"; `clearOrderDraft` after a successful save/finalize.
- [ ] **Step 6: Run** phone + desktop production-orders specs — PASS; `npm run test:web`, `npm run lint` — PASS.
- [ ] **Step 7: Commit** `feat(orders): phone Branch Orders with restorable drafts`.

---

### Task 10: Logout guard, notices, docs, full verification

**Files:**
- Modify: `src/components/layout/Header.tsx`, `InventoryDesktop.tsx` (confirm `SmallScreenNotice` gone), `src/app/(app)/production-orders/page.tsx` (same), `docs/superpowers/specs/2026-09-29-e2e-playwright-design.md` §8, `e2e/full/phone/phone-count.spec.ts`

- [ ] **Step 1: Failing e2e** in `phone-count.spec.ts`: `'logging out with counts still queued asks first'` — offline, save a count, open the menu, Log out → dialog text "1 count hasn't reached the server yet" (singular) with "Stay" and "Log out anyway"; Stay keeps the session.
- [ ] **Step 2: Implement** in `Header.tsx`: before `logout()`, `createCountStore(user.id).read().length`; > 0 → `AlertDialog` "N counts haven't reached the server yet" (singular form for 1). `grep -rn "built for a wider screen" e2e/` and fix any spec that expected the notice on these two routes.
- [ ] **Step 3: Docs.** Matrix rows for `/inventory/details` and `/production/orders` (phone specs, revenue gating); README phone project (if not done in Task 6).
- [ ] **Step 4: Full verification:** `npm run lint`, `npm run test`, `npm run build`, `npm run e2e:smoke`, `npm run e2e` — all PASS. Report any failure verbatim.
- [ ] **Step 5: Commit** `feat(mobile): guard logout with queued counts; docs`.
