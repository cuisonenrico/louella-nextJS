# Phone layouts for the daily count and Branch Orders

Date: 2026-10-16 · Status: approved design, pending implementation plan

## 1. Why

Branch managers run their branch from their own phones (Android, ~360–412px wide).
The two screens they use every day — the inventory sheet (`/inventory/details`)
and Branch Orders (`/production/orders`) — are desktop grids: 32px cells, nine
columns scrolled sideways, 28px icon buttons, and a `SmallScreenNotice` telling
them to use a desktop. This design gives both screens a phone layout built for
the jobs managers actually do on a phone, without changing the desktop screens'
layout.

**Jobs, in order of frequency:** end-of-day counts (leftover, reject), placing
the same-morning branch order, correcting a delivery that does not match the
order, and transfers/adjustments.

**Success:** a manager enters a full day's counts and an order one-handed on a
phone, with no sideways scrolling or zooming, and loses nothing when the signal
drops mid-count.

**Constraints:** branch connections are patchy (not offline — no offline mode);
desktop behaviour stays as it is apart from §6; no backend changes except the
permission key in §6.

## 2. Decisions

| Area | Decision |
|---|---|
| Count layout | Compact list + bottom sheet (mockup option C) |
| Delivery correction | Inside the product sheet (D1); no separate receiving step |
| Adjustments | Same terms as desktop: Pull In / Pull Out (+ optional branch = transfer) / Anomaly |
| Orders entry | Inline steppers (O1) with "Fill all from suggestions" |
| Orders default day | Today (orders are placed the same morning) |
| Phone navigation | Bottom tab bar (N1), phones only |
| Cash | Tab links to the **existing** `BranchCashPanel`, unchanged |
| Stock value | ₱ of on-hand per product, managers and admins |
| Revenue | Hidden from managers on these screens, phone and desktop |
| Architecture | Phone views in the same routes, sharing data hooks with desktop (approach 1) |

Rejected: separate `/m/*` routes (duplicated logic, links open the wrong layout
per device); CSS-only responsive tables (cannot express sheets, steppers or
"Save & next"); a separate "Receive delivery" checklist (needs a new
received-at field and a second screen); plain-language adjustment choices
("Send to another branch", "Something's off") — confusing next to the terms
managers already know.

## 3. Screens

### 3.1 Count (`/inventory/details`, below `md`)

- **Header:** "Count · <branch>", the day, and "N of M counted". A day bar with
  ‹ previous / Today / next › and the sync chip (§5). Admins get a branch
  picker; a branch-scoped manager does not. Always one day — date-range mode is
  desktop only.
- **Incoming transfers** waiting for this branch appear as cards above the list
  with full-size **Accept** / **Reject** (the actions `PendingTransfersPanel`
  has today).
- **Initialize:** when products have no row for the day, the existing
  "Initialize N rows" action appears above the list, as on desktop.
- **List**, grouped by product type in the configured product order, 48px rows:
  `Product · On hand · ₱ stock value · Left · Rej · Sold`. An uncounted leftover
  shows "–" and its row is tinted. A product with adjustments carries a small
  tag (e.g. "−5 sent"). Row values include queued edits (§5).
- **Tap a row → product sheet** (bottom sheet):
  - Name and "n of M".
  - **Delivery block (D1):** read-only figure with "✓ matches order" when it
    equals the ordered amount, and a "Different count?" link. Tapping it turns
    the figure into a stepper showing "Ordered N" and the difference ("2 short"
    / "3 over") with **Undo** (restore the ordered amount). If no finalized order
    exists for the product, the block shows the delivery figure with an Edit link
    and no ordered/matches wording.
  - "Open X + Deliv Y (+ adj) = On hand Z · ₱value".
  - **Leftover** and **Reject** steppers (44px −/+ with a number input).
  - Sold (and ₱ beside it only with `inventory-history:revenue`, §6).
  - **Adjust…** (if `inventory-adjustments:create`) and **Save & next ›**.
    Save & next queues the row (§5) and opens the next product in list order;
    on the last product it closes the sheet.
- When not editable (no `inventory-history:edit`), the sheet is read-only and
  shows no steppers or Save.

**"Ordered"** = the sum of that product's items across the day's **finalized**
production orders for the branch (several orders add up). Read from the
production-orders query for the branch and day; no new endpoint.

### 3.2 Adjust (from the product sheet)

- A segmented control **Pull In / Pull Out / Anomaly**, a quantity stepper and
  an optional note.
- With **Pull Out**, an optional **To branch** select appears (only with
  `inventory-adjustments:transfer`). Choosing a branch makes it a transfer, as
  the desktop dialog does; the sheet shows "Can send up to N" (the existing
  pull-out cap) and "Leaves your count now. <Branch> gets it once they accept."
- Below: today's adjustments for this product; a pending transfer can be
  cancelled there (only with `inventory-adjustments:delete`, as today).
- Not queued (§5.3).

### 3.3 Branch Orders (`/production/orders`, below `md`)

- Day bar (‹ / Today / ›), opening on **today**. Admins get a branch picker.
- **Order cards:** "PO #id", status chip, time, product count, total pieces, the
  first few items as tags ("+N more"). Drafts have full-size **Edit** and
  **Finalize** buttons; **Cancel** and **Delete** are in a ⋯ menu. Each action
  is shown only with its existing permission and keeps its existing confirm
  dialog.
- The "all drafts" alert and the day stats stay, condensed to one line.
- **＋ New order** floating button.
- **Order form (O1):** full screen. "Suggestions from <period>" select and
  **Fill all from suggestions**. Rows grouped by type: name, "avg sold N/day",
  a tappable suggestion chip (↑ N, sets the quantity) and a quantity stepper.
  Bottom bar: total pieces, products with quantity, **Save draft**, and
  **Finalize** (on an existing draft). Branch is fixed to the manager's branch;
  admins pick it in the form as today. Notes field at the bottom.

### 3.4 Phone tab bar

`PhoneTabBar`, rendered by `AppShell` below `md` only:

| Tab | Goes to | Shown with |
|---|---|---|
| Count | `/inventory/details` | `inventory-history` |
| Orders | `/production/orders` | `production-orders` |
| Cash | `/inventory/details?view=cash` | `branch-cash` |
| More | opens the existing sidebar sheet | always |

The Count tab carries a badge with the number of incoming transfers awaiting
this user's branch (same query as `PendingTransfersPanel`). `?view=cash`
renders only the existing `BranchCashPanel` for the selected branch and day,
unchanged. Page content gets bottom padding so the bar never covers it.

`SmallScreenNotice` is removed from these two pages only.

## 4. Architecture

Approach 1: phone views live in the same routes and share data hooks with the
desktop views.

- **`inventory/hooks/useInventoryDay.ts`** — everything the details page holds
  today: filters, queries (inventory, summary, products, branches), pending
  edits, bulk create/save mutations, and the per-row figures
  (`uncounted`, effective leftover, total stock, sold, stock value, revenue)
  currently computed in `InventoryTableRow`. Both views read the figures from
  here so the rules live in one place.
- **`inventory/details/page.tsx`** becomes thin: `useIsMobile()` picks
  `<InventoryPhone/>` or `<InventoryDesktop/>` (today's markup, moved, plus §6).
- **`production-orders/hooks/useBranchOrders.ts`** and
  `<OrdersPhone/>` / `<OrdersDesktop/>`, same split. The phone order form is a
  new component beside `ProductionOrderFormDialog`; both use one form hook for
  items, suggestions and save.
- **Shared phone components** in `src/components/mobile/`: `Stepper`,
  `ProductSheet` (on `ui/sheet`'s bottom variant, as `ResponsiveDialog` uses),
  `SyncChip`, `PhoneTabBar`.
- **Backend:** unchanged apart from the permission key. Count saves use
  `PATCH inventory/bulk`; adjustments, transfers and orders use their existing
  endpoints.
- Phone views follow screen width, not role: an admin on a phone gets them too,
  with a branch picker.

## 5. Saving on a patchy connection

### 5.1 Count queue (`src/lib/mobile/countQueue.ts`)

- Save & next writes `{ inventoryId, delivery?, leftover?, reject? }` to a queue
  in `localStorage` under `louella:count-queue:v1:<userId>`, then tries to send.
- **Latest values win:** one entry per inventory row; a later save merges over
  the earlier one. Each entry carries a revision number.
- **Send:** all waiting entries in **one** `PATCH inventory/bulk`. On success,
  remove each entry whose revision is unchanged (edits made during the request
  stay queued). Values are absolute, so a replay is harmless.
- **Triggers:** after each save, the `online` event, `visibilitychange` to
  visible, page load, and a backoff timer (2s, 5s, 15s, then every 30s) while
  anything is waiting. One send in flight at a time.
- **Display:** the list and sheet overlay queued values on server data, like
  desktop's pending cells. After a successful send, invalidate `inventory`,
  `inventory-summary` and the branch-cash key, as the desktop save does.
- **Storage access** is wrapped in try/catch; if `localStorage` is unavailable
  the queue falls back to memory and the chip says changes are kept only until
  the page closes.
- **Logout** with entries waiting asks first ("3 counts haven't reached the
  server yet"). Entries are per user, so another login on the same phone never
  sends them.
- Only counts are stored — never tokens.

### 5.2 Failures

| Failure | Handling |
|---|---|
| Network error, timeout, 5xx, 429 | Stay queued; chip "● N waiting for signal"; retried |
| 401 | `api.ts` refreshes as usual; if refresh fails, keep the queue, go to login, resume after |
| 400, 403, 404 | Removed from retries and listed in red in the chip ("1 couldn't save — Ensaymada: <reason>") with **Edit** and **Discard**. Never dropped silently |
| Same row edited on desktop and phone | Last save wins, as today |

The bulk endpoint applies a batch in one transaction, so a 4xx rejects the whole
batch. On a 4xx with several rows, the queue re-sends rows one at a time to find
the bad one(s); the others proceed.

### 5.3 Not queued

- **Order form:** the form state is saved to `localStorage`
  (`louella:order-draft:v1:<userId>:<branchId>:<date>:<orderId|new>`), debounced,
  and restored on reopening ("Restored your unsaved order from 9:12 AM ·
  Discard"). Cleared when Save draft or Finalize succeeds. **Finalize is never
  queued** — it books yield, delivery and materials and needs a live answer; on
  failure it shows the error and the draft stays.
- **Adjustments and transfers:** need server checks (pull-out cap, receiver
  accept). While offline (`navigator.onLine === false`) the submit button reads
  "Needs signal" and is disabled; the form keeps its values. The existing
  idempotency key prevents a retry from booking twice.

## 6. Stock value and revenue visibility

- **Stock value** = on hand × that day's product price (the same day-dated price
  the sheet uses for revenue). Shown to everyone who can see the sheet: phone
  list and sheet; desktop gets a **Stock ₱** column after Total. Computed in
  `useInventoryDay`; uncounted rows use the derived on-hand like the other
  figures.
- **New feature key `inventory-history:revenue`** (a panel key, like
  `dashboard:revenue-trend`). Default grant: every role **except MANAGER**.
  Admins can grant it to a manager on the permissions screen.
- Without the key, hidden on `/inventory/details` (phone and desktop): the
  Revenue column, the ₱ beside Sold in the phone sheet, the revenue cards and
  the top-product ₱ in `InventorySummaryPanel`. **Sold stays.**
- The Cash panel's sales and expected cash are unaffected — managers need them
  to reconcile the drawer.
- This is UI hiding, not a security boundary: the summary and inventory
  endpoints still return revenue to any authenticated reader, consistent with
  the app's read policy. Server-side stripping is out of scope.

## 7. Testing

- **New Playwright project `phone-chromium`** (`devices['Pixel 7']`), matching
  only `e2e/full/phone/*.spec.ts`; the desktop and iPad projects ignore that
  folder.
  - `phone-count.spec.ts`: manager counts via the sheet with Save & next,
    verified through the `api` fixture; delivery mismatch shows "2 short" and
    saves; stock ₱ figure from the rule; no revenue visible to the manager;
    offline save (`context.setOffline`) shows the waiting chip and drains on
    reconnect; reload while a save is blocked, then unblock and verify it
    drained; a 4xx row is shown as "couldn't save" and can be discarded.
  - `phone-orders.spec.ts`: Fill all from suggestions, change one stepper,
    Finalize; the count sheet then shows "✓ matches order"; the draft is
    restored after a reload.
  - `phone-transfers.spec.ts`: Pull Out to a branch; the receiving manager sees
    the tab badge and the incoming card, accepts, and the stock moves.
- **Desktop:** `inventory-sheet.spec.ts` — no Revenue column or revenue cards
  for a manager, still shown for admin; Stock ₱ column. RBAC matrix spec covers
  `inventory-history:revenue` defaults.
- **Vitest:** `countQueue` (latest wins, revisions, failure types, per-user keys,
  storage unavailable) and the figures moved into `useInventoryDay`.
- Update the coverage matrix (§8 of the e2e design) rows for
  `/inventory/details` and `/production/orders`, and add the phone project to
  `e2e/README.md`.

## 8. Out of scope

- A phone layout for branch cash (the Cash tab shows the current panel).
- Offline mode / service worker. Counting through a signal drop is covered, and
  queued counts survive a reload or a closed tab, but the page itself needs a
  connection to load; queued counts send on the next successful load.
- Server-side hiding of revenue.
- Phone layouts for other grid pages (production board, material inventory).
- A delivery "received" confirmation step.
