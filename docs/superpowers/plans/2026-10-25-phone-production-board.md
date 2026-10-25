# Phone Production Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone layout (below `md`) for `/production`: list + product sheet to edit yield and branch quantities, saved through a per-user board queue with a stale-overwrite check.

**Architecture:** Extract the board's data into `useProductionData`; desktop body moves unchanged to `ProductionDesktop`; new `ProductionPhone` uses the data hook plus `useBoardQueue`. `page.tsx` switches with `useIsMobile()`.

**Tech Stack:** Next.js 16 client page, TanStack Query, shadcn/ui, Vitest + Testing Library, Playwright (`phone-chromium`, `desktop-chromium`).

**Spec:** `docs/superpowers/specs/2026-10-25-phone-production-board-design.md`

## Global Constraints

- Desktop board behaviour unchanged. Material stock unchanged (keeps `SmallScreenNotice`).
- Edit rights on the phone: `useCan('production:create') && useCan('all-branches')`; otherwise read-only with "Only the kitchen changes yield and branch splits."
- Queue key `louella:board-queue:v1:<userId>`; storage access in try/catch.
- Copy: "Planned", "Yield", "Send to branches", "ordered N", "Assigned A of Y", "Lower a branch to match the yield", "From plan — not saved yet", "N over plan" / "N short of plan" / "Matches plan", "Changed to N on the server — check and save again", "Setting up…", "Materials", "Save & next ›".
- Manila day via `manilaToday()`. Touch targets ≥ 44px. No server changes.
- E2E never against `.env` (production).

## Review Focus

1. Day changed while board entries are queued — entries carry their date and still send to that day; overlay only matches the shown day's keys.
2. Yield lowered below what branches hold — Save & next disabled for that product only; other products still save. (Task 3 unit + e2e.)
3. Order finalized while a yield edit is queued offline — entry flagged, not sent. (Task 2 unit + Task 3 e2e.)
4. Branch-scoped manager on the phone — read-only, no steppers. (Task 3 e2e.)
5. Stored yield 0 with planned > 0 — stepper starts at planned with "From plan — not saved yet"; saving sends that value with base 0. (Task 3 unit.)

---

### Task 1: `useProductionData` + `ProductionDesktop` + desktop board e2e

**Files:** Create `src/app/(app)/production/hooks/useProductionData.ts`, `src/app/(app)/production/components/ProductionDesktop.tsx`, `e2e/full/production-board.spec.ts`; Modify `src/app/(app)/production/page.tsx`.

**Interfaces — Produces:** `useProductionData(filterDate: string)` → `{ branches, products, productById, prodQuery, invQuery, rawOrders, plannedYields, plannedByProduct, orderedByProductBranch: Map<string /* `${productId}:${branchId}` */, number>, branchesWithNoInventory, inventoryByProductBranch, allRows: ProdRow[], rowsByType, initAllBranchesMutation-driven auto-init (inside the hook) }`. `ProductionDesktop({ filterDate, setFilterDate })` = today's page body (staged edits, auto-sync, save) reading data from the hook.

- [ ] Step 1: Write `e2e/full/production-board.spec.ts` (desktop, admin): world with 1 product; finalize an order of 10 for the world branch via API; open `/production`; set the product's Yield cell to 12 and the world branch's cell to 10; click Save; API `GET /production/date?date=today` (kitchen) shows yield 12 for the product, world branch inventory delivery 10. Run on current code — expected PASS (regression baseline for the move).
- [ ] Step 2: Move data code into `useProductionData`; move JSX + staged-edit logic into `ProductionDesktop`; `page.tsx` renders `<ProductionDesktop/>`. `orderedByProductBranch` = Σ item.yield over FINALIZED orders by product and `order.branchId`.
- [ ] Step 3: `npx tsc --noEmit`, `npm run lint`, vitest production tests, then the new e2e spec on desktop-chromium — PASS.
- [ ] Step 4: Commit `refactor(production): extract useProductionData; desktop board e2e`.

### Task 2: Board queue (pure + hook)

**Files:** Create `src/lib/mobile/boardQueue.ts` (+ `.spec.ts`), `src/lib/mobile/useBoardQueue.ts` (+ `.spec.tsx`). Modify `src/lib/mobile/countQueue.ts` only to export reusable helpers if needed.

**Interfaces — Produces:**
- `type BoardEntry = { key: string; kind: 'yield' | 'delivery'; date: string; productId: number; inventoryId?: number; value: number; base: number; rev: number; error?: string }`
- `boardKey(e: { kind; date; productId; inventoryId? }): string` → `yield:<date>:<productId>` | `delivery:<inventoryId>`
- `createBoardStore(userId, storage?)` (same contract as `createCountStore`), `enqueueBoard(entries, e: Omit<BoardEntry,'key'|'rev'|'error'>): BoardEntry[]` (latest value wins, keeps the **first** base until settled, rev+1, clears error), `settleBoard`, `markBoardFailed`, `discardBoard`.
- `conflicts(entries: BoardEntry[], server: { yieldOf(date, productId): number | undefined; deliveryOf(inventoryId): number | undefined }): BoardEntry[]` — entries whose server value is defined and ≠ `base`.
- `useBoardQueue(userId, opts?: { storage?: Storage })` → `{ entries, waiting, failed, overlayYield(date, productId): number | undefined, overlayDelivery(inventoryId): number | undefined, save(changes: Omit<BoardEntry,'key'|'rev'|'error'>[]): void, discard(key: string): void, sending, persistent }`.

Drain: for each date in the batch `qc.fetchQuery` `['production', date]` (`productionApi.byDateRange(date)`) and `['inventory-for-production', date]` (`inventoryApi.byDateRange(date)`) with `staleTime: 0`; flag `conflicts` with `"Changed to ${server} on the server — check and save again"`; send remaining yields via `productionApi.upsertBulk` and deliveries via `inventoryApi.updateBulk` (15s timeout via an optional config arg, as `updateBulk` already has); on `reject` with >1 entries retry one at a time; settle after re-fetch; then invalidate `['production']`, `['inventory']`, `['inventory-for-production']`. Triggers/backoff/auth exactly as `useCountQueue`.

- [ ] Step 1: Failing pure tests: latest value wins but base stays the first; separate keys per date; `conflicts` flags yield when server 24 ≠ base 13 and passes when equal or unknown; store per user / corrupt / throwing storage.
- [ ] Step 2: Failing hook tests (mock apiServices, fake timers): save sends one upsert with `[{ productId, date, yield }]` and one inventory bulk; a server value ≠ base flags and sends nothing for that entry; network error retries after 2s; 401 keeps entries.
- [ ] Step 3: Implement; tests PASS; `tsc`, eslint clean.
- [ ] Step 4: Commit `feat(mobile): board save queue with stale-overwrite check`.

### Task 3: `ProductionPhone` (list, sheet, read-only) + page switch

**Files:** Create `src/app/(app)/production/components/phone/{ProductionPhone,BoardList,BoardSheet}.tsx` (+ `BoardSheet.spec.tsx`), `e2e/pages/phone-board.page.ts`, `e2e/full/phone/phone-production.spec.ts`; Modify `page.tsx` (switch), remove `SmallScreenNotice` from the board, `src/app/(app)/production/lib/allocation.ts` (+ spec).

**Interfaces — Consumes:** Task 1 hook, Task 2 queue, `ProductSheet`, `Stepper`, `SyncChip`.
**Produces:** `allocation(yieldVal: number, branchValues: number[]): { assigned: number; over: boolean }`; `startingYield(stored: number, planned: number): { value: number; fromPlan: boolean }` (fromPlan when stored 0 and planned > 0).

- [ ] Step 1: Failing unit tests: `allocation(10, [8,5])` → `{ assigned: 13, over: true }`; `startingYield(0, 24)` → `{ value: 24, fromPlan: true }`; `startingYield(30, 24)` → `{ value: 30, fromPlan: false }`; BoardSheet: Save & next disabled with "Lower a branch to match the yield" when over; enabled after lowering a branch; onSave called with only touched fields, each with `base` = server value at open (0 for a from-plan yield).
- [ ] Step 2: Failing e2e `phone-production.spec.ts` (admin on Pixel 7 via `page` fixture with phone project — admin page fixture, viewport from project): finalize order 10 for the world branch; open `/production`; product row shows Planned 10 / Yield 10; open sheet; Yield → 12; world branch stepper → 12; Save & next; API yield 12 and delivery 12. Over-allocation: yield 8 with branch 10 → Save disabled. Offline: setOffline, change yield, save → "waiting for signal", online → saved. Conflict: route-block the board's sends, save yield 12, then via API finalize another order (+5) → unblock + `online` → chip "couldn't save" with "Changed to … on the server". Read-only: world manager (`managerPage` with Pixel 7) sees "Only the kitchen changes yield and branch splits." and no Yield stepper. No "Exp. Sales"/"Mat. Cost" text on the phone.
- [ ] Step 3: Implement components per spec §4a; `page.tsx`: `useIsMobile() ? <ProductionPhone/> : <ProductionDesktop/>` sharing `filterDate` state.
- [ ] Step 4: unit + phone e2e + desktop production specs PASS; lint; tsc.
- [ ] Step 5: Commit `feat(production): phone production board`.

### Task 4: Docs + full verification

- [ ] Update e2e coverage matrix row `/production`; AGENTS.md frontend paragraph mentions the board; e2e README unchanged unless new rules.
- [ ] `npm run lint`, `npm run test`, `npx playwright test` (all projects) — PASS; report any failure verbatim.
- [ ] Commit `docs: phone production board coverage`.
