# Phone layout for the production board

Date: 2026-10-25 · Status: approved (user: "work on this until it is implemented")

## 1. Why

Admins and managers with production access enter the kitchen's **actual yield**
during the day, often from a phone, and move each branch's share when the yield
differs from the plan. The production board (`/production`) is a desktop grid —
one row per product, one column per branch, 32px cells — and tells phone users
to use a desktop (`SmallScreenNotice`). This gives it a phone layout in the same
style as the phone count (spec `2026-10-16-mobile-count-and-orders-design.md`).

**Success:** on a phone, a person can update a product's yield and its branch
split in a few taps, see at a glance which products are short, over or not yet
baked, and lose nothing when the signal drops.

## 2. Decisions (from the user)

- Users: admins and managers who hold the `production` feature.
- Main job: entering the **actual yield**. Yield is a **running total**, edited in
  place (no "add a batch" control).
- The yield starts the day at the **planned** figure (finalized morning orders)
  and goes **up** as afternoon production is added.
- Whoever edits the yield also edits **each branch's quantity**; when the yield is
  more or less than planned, they reallocate between branches.
- **Planned** (Σ finalized orders) must be easy to see. Label: "Planned".
- Connection in the kitchen is **patchy**, like the branches: nothing typed may be
  lost.
- **Material stock is out of scope** — it keeps its desktop layout and notice.
- Branch Orders "confirming" (Finalize) already has a phone layout; not repeated.

## 3. Facts from the code (verified)

- A branch's quantity on the board **is that branch's `Inventory.delivery`** for
  the day (`useProductionRowUpdate`: `branch_<id>` → `pendingInventory`), saved
  with `PATCH /inventory/bulk`. It is the same figure branch managers see as
  "Delivery" on the phone count.
- Yield is saved with `POST /production/upsert-bulk`
  (`{ productId, date, yield }`, keyed on branch+product+date → absolute values,
  safe to replay). Requires `production:create` (MANAGER floor).
- Desktop refuses the whole save while **any** product has
  Σ branch quantities > yield (`overAllocatedByProduct`, `ProductionPendingBar`).
- Desktop auto-fills a yield of 0 with the planned figure as an **unsaved** edit
  (`useYieldAutoSync`) when planned > 0.
- A branch with no inventory row for the day shows a "+" that runs
  `jobsApi.autofill(date)` (`initBranchMutation`); the page also runs it for
  every such branch automatically on load (`initAllBranchesMutation`).
- Yield is always booked to the kitchen branch (`PRODUCTION_BRANCH_ID`, 1 by
  default). `BranchGuard` stamps a branch-scoped user's own branch on writes and
  scopes their reads, so a manager without `all-branches` sees only their own
  branch's rows and would save yield onto their own branch. The desktop board has
  this gap today; it is out of scope here (§8).
- Finalizing a branch order adds to the kitchen yield and that branch's delivery
  on the server, so the yield normally starts the day at the planned figure.
- "Materials" per product opens `MaterialConsumptionDrawer`.

## 4. Who can edit

- **Editing** (yield and branch quantities) on the phone: users holding
  `production:create` **and** `all-branches` — admins, and managers an admin has
  given every branch. (User-approved recommendation.)
- Everyone else who can open the board (e.g. a branch manager limited to their
  own branch) gets a **read-only** phone list of what their reads return, with
  "Only the kitchen changes yield and branch splits." No steppers, no Save.
- Note for the user: on production today the C2 manager is branch-scoped, so they
  get the read-only phone view until an admin grants them `all-branches`.

## 4a. The phone screen (`/production`, below `md`)

### 4.1 List

- Header "Production"; day bar ‹ Today › (Manila day, `manilaToday()`), as the
  phone count's `PhoneDayBar` does it (no branch picker — the board is the
  kitchen's, it covers every branch).
- Status line: "N of M products have yield" and the sync chip (§5).
- The "No Branch Orders have been finalized…" alert, as on desktop, linking to
  Branch Orders.
- Rows grouped by product type, 52px, each a button:
  `Product` · **Planned** · **Yield** · **Diff** (yield − planned, green when
  positive, amber when negative, "–" with no yield).
  Second line: "to N branches · all assigned", or "assigned 13 of 10" (red, row
  tinted) when Σ branches > yield. (No "not baked yet": the yield starts at the
  planned figure.)
- Values include edits still waiting in the phone's queue (§5).

### 4.2 Product sheet (bottom sheet, `ProductSheet`)

- Title product name, subtitle "n of M".
- "Planned P" (from finalized orders) prominently.
- **Yield** stepper (label "Yield"). When the stored yield is 0 and planned > 0,
  the stepper starts at the planned figure, with "From plan — not saved yet"
  (mirrors desktop's auto-fill; nothing is written until Save).
- Line: "N over plan" / "N short of plan" / "Matches plan".
- **Send to branches**: one row per active branch — branch name, "ordered O"
  (that branch's finalized order quantity for the product), and a stepper
  (label = branch name) starting at the branch's current delivery.
  A branch with no inventory row yet shows "Setting up…" (the page's existing
  automatic initialization creates it) instead of a stepper.
- Allocation line: "Assigned A of Y". When A > Y: red, and
  **Save & next is disabled** with "Lower a branch to match the yield".
  Only this product is blocked (desktop blocks the whole sheet).
- Footer: "Materials" (opens the existing `MaterialConsumptionDrawer`) and
  "Save & next ›". Save & next queues only the fields the person touched (yield
  and/or branch quantities) and opens the next product.
- Read-only (no steppers, no Save) without edit rights (§4).

### 4.3 Not on the phone

Expected sales, material cost, and the day summary accordion. Desktop is
unchanged.

### 4.4 Getting there

Through "More" in the phone tab bar (the three tabs stay Count / Orders / Cash).
`SmallScreenNotice` is removed from `/production`; it stays on
`/material-inventory`.

## 5. Saving on a patchy connection

- One per-user queue for the board, `louella:board-queue:v1:<userId>`. Entries:
  `{ key, kind: 'yield' | 'delivery', date, productId, inventoryId?, value, base,
  rev, error? }` — `key` is `yield:<date>:<productId>` or
  `delivery:<inventoryId>`; `base` is the server figure the person started from.
- Latest save wins per key; revision-checked settle; 15s timeout; backoff
  2/5/15/30s; retry on network/5xx/429; keep on 401; flag on other 4xx with
  Edit/Discard (same rules as the count queue, reusing its `classifyError`,
  `BACKOFF_MS` and store helpers).
- **No stale overwrite.** Before sending, the drain fetches the day's current
  production and inventory rows. If the server figure differs from an entry's
  `base` (an order was finalized meanwhile, or someone edited the desktop board),
  that entry is not sent: it is flagged "Changed to N on the server — check and
  save again" with Edit/Discard. Everything else is sent: yields in one
  `POST /production/upsert-bulk`, deliveries in one `PATCH /inventory/bulk`; a
  refused batch is retried row by row.
- Entries settle only after the refreshed rows arrive. The list and sheet show
  queued values over server data. The sync chip covers this queue.
- After a send, invalidate `['production']`, `['inventory']`,
  `['inventory-for-production']`.
- Over-allocation is checked on the phone before queueing (§4a). No server check.
- Why a separate queue rather than the count queue: board entries need `base` for
  the conflict check and include yields. The same delivery figure could sit in
  both queues only if one person edits it on both screens on one phone; the
  conflict check makes the second send flag instead of overwrite.

## 6. Architecture

- Extract the board's data (queries, rows, planned, per-branch ordered,
  automatic branch initialization) from `production/page.tsx` into
  `useProductionData(filterDate)`. The desktop body moves unchanged into
  `ProductionDesktop` (which keeps its staged edits, auto-fill and save);
  `ProductionPhone` uses the same data hook plus the board queue.
- `page.tsx` picks the view with `useIsMobile()`.
- Reuse `ProductSheet`, `Stepper`, `SyncChip` and the phone count's patterns.

## 7. Testing

- Vitest: the board queue (latest wins per key, settle/revision, conflict flag
  when the server moved from `base`), the allocation check, the "from plan"
  starting value.
- Playwright, `e2e/full/phone/phone-production.spec.ts` (phone project), as admin
  or a manager with production access:
  - change a product's yield and a branch quantity → Save & next → the API shows
    the new yield (production) and delivery (inventory);
  - over-allocation disables Save & next for that product only;
  - offline save shows "waiting for signal" and sends on reconnect;
  - a figure changed on the server while offline is flagged, not overwritten;
  - a branch-scoped manager gets the read-only view;
  - no expected sales or material cost on the phone; Materials opens the
    breakdown.
- No e2e spec covers the desktop board today: add `e2e/full/production-board.spec.ts`
  (desktop: enter yield and a branch quantity, save, verify via API) so the
  `ProductionDesktop` move has a regression test.
- Coverage matrix row for `/production` updated.

## 8. Out of scope

Material stock phone layout; an "add a batch" control; server-side
over-allocation check; changes to desktop behaviour, including the existing gap
where a branch-scoped manager's desktop yield lands on their own branch.

## 9. Left to the builder

Exact copy beyond what is quoted above, row spacing, and how the sync chip merges
the two queues' counts.
