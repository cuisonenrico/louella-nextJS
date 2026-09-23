# Louella Bakery — Web App

Next.js frontend for the Louella Bakery management system. Covers daily inventory entry, production tracking, material stock management, recipe costing, analytics, and data imports for a multi-branch bakery operation.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui (Radix primitives) |
| Server state | TanStack Query v5 |
| Client state | Zustand + AuthContext |
| HTTP client | Axios (auto-refresh on 401) |
| Charts | Recharts |
| Date handling | dayjs |

---

## Quick Start

```bash
npm install
cp .env.example .env         # set DATABASE_URL, DIRECT_URL and both JWT secrets
npm run prisma:deploy        # apply migrations to that database
npm run dev                  # app + API on http://localhost:4000, API at /api/v1
```

The frontend and the NestJS API (`src/server/`) are one app: the API is served
same-origin at `/api/v1`, so there is no separate backend to start.

---

## Environment Variables

See `.env.example` for every variable with notes. The ones the server refuses
to boot without:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres via Supabase's **transaction pooler** (port 6543, `pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Postgres **direct / session** connection (port 5432), used by migrations |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Random strings, at least 16 characters |

Leave **`NEXT_PUBLIC_API_URL` unset**. The API is same-origin; setting it
reintroduces a frontend/backend split that no longer exists, and it is inlined
at build time.

---

## Commands

```bash
npm run dev             # dev server (app + API)
npm run build           # prisma generate, then production build
npm run start           # serve the production build
npm run lint            # ESLint
npm run test            # vitest (frontend) + jest (server)
npm run prisma:deploy   # apply pending migrations to DATABASE_URL's database
```

CI (`.github/workflows/ci.yml`) runs lint, both typechecks, both test suites
and the build on every push to `master` and every pull request.

---

## Pages & Features

### Authentication

| Route | Description |
|---|---|
| `/login` | Email + password login form |
| `/register` | Dead stub — immediately redirects to `/login`. No self-service signup flow is wired up. |

Accounts are provisioned admin-only from the backend (`POST /users`) — an intentional access-control decision for this internal, multi-branch tool, not an oversight.

Session is managed via `AuthContext`. Access tokens live in memory only (`src/lib/tokenStore.ts`) — never in `localStorage` — so an XSS payload can't read a live bearer token off the page. The refresh token stays in an HttpOnly cookie; the Axios instance in `src/lib/api.ts` calls `POST /auth/refresh` on mount and on 401 to (re)mint an access token, retrying the original request once.

---

### Dashboard — `/dashboard`

Landing page for admin users. Shows a cross-branch operational snapshot for the current day:

- **KPI cards** — active branches, product count, production total
- **Production orders** — today's planned vs. actual yield
- **Wastage analysis** — rejected vs. delivered quantities by product, with branch and date range filters
- Material and inventory summaries

---

### Inventory

#### Daily Inventory Entry — `/inventory/details`

The primary daily workflow. Staff log deliveries, production received, and reject counts per product for their branch.

- Filter by branch, date, and product type (Bread / Cake / Special / Miscellaneous)
- Inline editable table — changes are staged locally and submitted as a batch
- **Cascade warning** — if a saved change affects leftover carry-forward, the system prompts before cascading the update through subsequent days
- **Rejection analytics card** — chart and table of reject rates for the visible date range
- Unsaved changes bar persists across scroll

#### Inventory Gaps — `/inventory/gaps`

Highlights branch × product × date combinations with no recorded entry, helping managers identify missed logging days before they affect downstream reporting.

#### Adjustments — `/inventory-adjustments`

Record stock corrections outside the normal delivery/production flow:

- **Pull In** — add stock (e.g. goods returned from a branch)
- **Pull Out** — remove stock (e.g. discarded items)
- **Anomaly** — flag an unexplained discrepancy
- **Transfer** — move stock between branches (creates a linked Pull Out + Pull In atomically)

#### Import — `/inventory-import`

Bulk-load inventory data from Excel/XLS files:

1. Upload file → preview parsed rows before committing
2. Confirm → rows are written and the import is logged

#### Import History — `/inventory-import/history`

Audit trail of all past imports: file name, date, uploader, row count, and status. Admins can delete log entries.

---

### Production

#### Daily Production Entry — `/production`

Log actual yield per product per branch for the day. Supports inline editing with a pending-changes bar before finalising.

- View material consumption estimate for a given planned yield
- Compare actual vs. planned (from Production Orders)

#### Production Orders — `/production-orders`

Plan tomorrow's production targets:

- Create a draft order with yield targets per product
- Finalize to lock in planned quantities (used for efficiency calculations)
- Cancel if no longer needed — cancelled orders are soft-deleted and kept for audit

#### Production Efficiency — `/production-efficiency`

Chart showing actual vs. planned yield over a selected date range, with per-product and per-branch breakdown.

#### Production Cost — `/production-cost`

Recipe-based cost analysis:

- Select a product and see the full ingredient breakdown with current material prices
- Unit conversions applied automatically (e.g. recipe in grams, material priced per kg)
- Displays cost per unit and suggested retail margin

---

### Materials

#### Material Catalogue — `/materials`

Master list of raw materials (flour, sugar, eggs, etc.) with base unit, reorder level, and current price per supplier. Editing a material updates its price history.

#### Material Stock Cards — `/material-inventory`

Daily global stock cards (central kitchen — not per-branch):

- View or edit the opening stock, received, consumed, and closing stock for any date
- Bulk-set stock for a date range
- Add adjustments (Pull In / Pull Out / Anomaly) to a card

#### Material Gaps — `/material-inventory/gaps`

Dates where a stock card was never created, so managers can initialise missing records.

---

### Recipes — `/recipes`

Define the ingredient list for each product:

- Add/remove recipe items (material + quantity + unit)
- View the auto-calculated cost using current material prices and unit conversions
- Recipes drive both the production cost page and the material consumption estimates in production

---

### Sales — `/sales`

Read-only revenue summaries derived from inventory data (no separate POS integration). Shows sold quantities and revenue per branch, product, and date range.

---

### Master Data

| Route | Description |
|---|---|
| `/products` | Product catalogue — create, edit, soft-delete. Set type and price. |
| `/branches` | Branch list — name, address, contact details, active flag |
| `/suppliers` | Vendor directory — name, contact, associated material prices |
| `/unit-conversions` | Conversion factors between units (e.g. 1 kg = 1000 g). Both directions auto-stored. |
| `/config/product-order` | Drag-and-drop reordering of products within each type group (controls display order in inventory tables) |

---

## Architecture

### Data Fetching

All server state goes through **TanStack Query**. Each feature area has one or more custom hooks (e.g. `useInventoryColumns`, `useProductionMutations`) that wrap `useQuery` / `useMutation`. Mutations invalidate relevant query keys on success so UI refreshes automatically.

The Axios instance (`src/lib/api.ts`):
- Attaches `Authorization: Bearer <token>` on every request
- On 401, calls `/auth/refresh`, stores the new access token, and retries once
- On retry failure, clears auth state and redirects to `/login`

### Auth

`AuthContext` (`src/contexts/AuthContext.tsx`) wraps the entire app and exposes `useAuth()`. The access token does not survive a page refresh by design — on mount, `AuthContext` silently exchanges the HttpOnly refresh cookie for a new access token via `refreshAccessToken()` (`src/lib/api.ts`) and re-hydrates the session from `/auth/me`. Protected routes are wrapped in `AuthGuard` which redirects unauthenticated users to `/login`.

### Component Structure

```
src/
  app/              # Next.js App Router pages
  components/
    analytics/      # Charts and analytics cards
    inventory/      # Inventory table, filter bar, adjustment dialogs
    layout/         # AppLayout, Header, Sidebar, AuthGuard
    materials/      # Stock card dialog, adjustment drawer
    production/     # Production tables, order form, efficiency charts
    ui/             # shadcn/ui primitives (button, card, select, …)
  contexts/         # AuthContext
  hooks/            # Shared custom hooks
  lib/
    api.ts          # Axios instance with auth + retry logic
    apiServices.ts  # Typed API wrappers (one namespace per backend module)
    errors.ts       # Shared error extraction helper
  store/            # Zustand stores
  types/            # Shared TypeScript interfaces and enums
```

### API Service Layer

`src/lib/apiServices.ts` exports a typed namespace per backend module:

```
authApi              inventoryApi            productionApi
branchesApi          inventoryAdjustmentsApi productionOrdersApi
productsApi          inventoryImportApi      materialsApi
suppliersApi         importLogsApi           materialInventoryApi
recipesApi           salesApi                materialAdjustmentsApi
unitConversionsApi   dashboardApi            jobsApi
notificationsApi
```

All methods return an Axios response with a typed `data` property. Pass response directly to TanStack Query's `queryFn`:

```ts
useQuery({
  queryKey: ['branches'],
  queryFn: () => branchesApi.list().then((r) => r.data),
});
```

---

## Role-Based UI

The UI adjusts based on the authenticated user's role:

| Role | Access |
|---|---|
| `ADMIN` | Full access — master data, imports, user management, all branches |
| `MANAGER` | Finalize/cancel production orders; view all branches |
| `INVENTORY` | Inventory entry + adjustments; recascade trigger |
| `USER` | Daily entry for own branch |
| `VIEWER` | Read-only across all modules |

---

## Deployment

One Vercel project serves both the app and the API; Vercel deploys every push
to `master`. See `docs/DEPLOYMENT.md`.

When a release includes migrations, apply them to the deployed database first,
then check the stock chains (a dry run by default; `--apply` writes):

```bash
npm run prisma:deploy
npx tsx scripts/repair-stock-chains.ts
```
