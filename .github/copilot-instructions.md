# louella-web — Next.js Frontend Copilot Instructions

## Stack
- **Framework:** Next.js 16 (App Router), TypeScript 5, React 19
- **UI Components:** MUI v7 (`@mui/material`), MUI X DataGrid v8, MUI X DatePickers v8
- **Data Fetching:** TanStack Query v5 (React Query)
- **HTTP Client:** Axios (`src/lib/api.ts`)
- **Date Handling:** dayjs
- **Auth State:** React Context (`src/contexts/AuthContext.tsx`)

---

## Project Structure

```
src/
  app/
    layout.tsx             ← root layout, wraps with <Providers>
    page.tsx               ← redirects to /dashboard
    <module>/
      page.tsx             ← one file per route, 'use client'
  components/
    AuthGuard.tsx          ← auth protection wrapper
    Providers.tsx          ← QueryClient + ThemeProvider + AuthProvider
    layout/
      AppLayout.tsx        ← sidebar + header shell
      Sidebar.tsx          ← nav items, add new routes here
      Header.tsx           ← user menu, logout
  contexts/
    AuthContext.tsx        ← user state, login/logout/register
  lib/
    api.ts                 ← Axios instance + interceptors (auth + auto-refresh)
    apiServices.ts         ← all domain API objects
    theme.ts               ← MUI theme
  types/
    index.ts               ← all TypeScript interfaces and enums
```

---

## TypeScript Types (`src/types/index.ts`)

All types here must mirror the BE Prisma schema exactly. Rules:
- IDs are always `number`.
- Enums are string union types matching Prisma enum values exactly.
- Dates are `string` (the BE sends ISO strings).
- Soft-delete models include `deletedAt: string | null`.
- Nested relations are always optional: `branch?: Branch`.

### Enums (must match Prisma schema)
```typescript
type UserRole = 'USER' | 'VIEWER' | 'INVENTORY' | 'MANAGER' | 'ADMIN';
type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL';
type MeasurementUnit = 'KG' | 'G' | 'LITER' | 'ML' | 'PIECE' | 'DOZEN' | 'BAG' | 'SACHET' | 'CUP' | 'TBSP' | 'TSP';
type FileStatus = 'PENDING' | 'UPLOADED' | 'PROCESSING' | 'FAILED';
type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
```

### Paginated Response
```typescript
interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

## API Client (`src/lib/api.ts`)

- Base URL: `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'`
- `withCredentials: true` for HttpOnly refresh cookie support.
- **Request interceptor:** attaches `Authorization: Bearer <accessToken>` from `localStorage` (SSR-safe).
- **Response interceptor:** on 401, auto-refreshes using `refreshToken` from `localStorage`. On success, replays queued failed requests. On failure, clears tokens and redirects to `/login`.
- Do **not** modify `api.ts` for individual features — it is a shared infrastructure file.

---

## API Services (`src/lib/apiServices.ts`)

Each domain has a typed object exported from this file. Use the pattern:

```typescript
export const xxxApi = {
  list: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<Xxx>>(`/xxxs`, { params: { page, limit } }),
  search: (q: string) =>
    api.get<Xxx[]>(`/xxxs/search`, { params: { q } }),
  get: (id: number) =>
    api.get<Xxx>(`/xxxs/${id}`),
  create: (data: CreateXxxPayload) =>
    api.post<Xxx>(`/xxxs`, data),
  update: (id: number, data: Partial<CreateXxxPayload>) =>
    api.patch<Xxx>(`/xxxs/${id}`, data),
  delete: (id: number) =>
    api.delete(`/xxxs/${id}`),
};
```

- Route paths must exactly match the BE `@Controller('route-name')` prefix.
- For non-paginated lists (small datasets like materials, products), response type is `T[]`.
- For paginated lists (inventory, production, material-inventory), response type is `PaginatedResponse<T>`.

---

## Auth Architecture

### `AuthContext` (`src/contexts/AuthContext.tsx`)
- Provides: `{ user, accessToken, isAuthenticated, isLoading, login, logout, register }`
- On mount: reads `localStorage.accessToken` → calls `authApi.me()` to hydrate user.
- `login` / `register`: store both `accessToken` and `refreshToken` in `localStorage`.
- `logout`: calls `authApi.logout()`, clears `localStorage`.
- `useAuth()` hook: throws if used outside `<AuthProvider>`.

### `AuthGuard` (`src/components/AuthGuard.tsx`)
- Shows `<CircularProgress>` while `isLoading`.
- Redirects to `/login` if not authenticated.
- **Every protected page must return `<AuthGuard><AppLayout>...</AppLayout></AuthGuard>`.**

---

## Standard CRUD Page Pattern

File: `src/app/<module>/page.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Typography, Alert, CircularProgress, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { xxxApi } from '@/lib/apiServices';
import type { Xxx } from '@/types';

// ── Form state interface (numbers stored as strings until submit) ──────────
interface XxxForm {
  name: string;
  value: string;        // number fields are strings in form state
  type: ProductType;    // enum fields use the actual type
  notes: string;
}
const defaultForm: XxxForm = { name: '', value: '', type: 'BREAD', notes: '' };

// ── Helper: extract error message from Axios error ────────────────────────
function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'An error occurred');
}

export default function XxxsPage() {
  const qc = useQueryClient();

  // UI state
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Xxx | null>(null);
  const [form, setForm] = useState<XxxForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Xxx | null>(null);
  const [formError, setFormError] = useState('');

  // Data fetching
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['xxxs'],
    queryFn: () => xxxApi.list().then(r => r.data),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateXxxPayload) => xxxApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['xxxs'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateXxxPayload> }) =>
      xxxApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['xxxs'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => xxxApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['xxxs'] }),
  });

  // Dialog helpers
  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setFormError('');
    setDialogOpen(true);
  };
  const openEdit = (item: Xxx) => {
    setEditTarget(item);
    setForm({ name: item.name, value: String(item.value), type: item.type, notes: item.notes ?? '' });
    setFormError('');
    setDialogOpen(true);
  };

  // Save with minimal client-side validation
  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    const payload = { name: form.name.trim(), value: parseFloat(form.value), type: form.type, notes: form.notes || undefined };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AuthGuard>
      <AppLayout title="Xxxs">
        {/* Top bar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <TextField size="small" placeholder="Search..." value={search}
            onChange={e => setSearch(e.target.value)} sx={{ width: 280 }} />
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add Xxx</Button>
        </Box>

        {/* Table */}
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={3} align="center"><CircularProgress size={24} /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={3} align="center">No xxxs found.</TableCell></TableRow>
                ) : filtered.map(item => (
                  <TableRow key={item.id} hover>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.value}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEdit(item)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(item)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>{editTarget ? 'Edit Xxx' : 'Add Xxx'}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Name" value={form.name} autoFocus required
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextField label="Value" type="number" value={form.value}
              onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
          <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
          <DialogContent>
            <Typography>This action cannot be undone.</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="error" variant="contained"
              disabled={deleteMutation.isPending}
              onClick={() => { deleteMutation.mutate(deleteTarget!.id); setDeleteTarget(null); }}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </AppLayout>
    </AuthGuard>
  );
}
```

---

## Adding a Navigation Item

Edit `src/components/layout/Sidebar.tsx` — append to `navItems`:

```typescript
const navItems = [
  // ... existing items ...
  { label: 'New Module', href: '/new-module', icon: <SomeIcon /> },
];
```

Import the icon from `@mui/icons-material`.

---

## TanStack Query Conventions

| Convention | Detail |
|---|---|
| Query keys | Flat string for simple: `['materials']`. Tuple with filters: `['production', selectedDate]` |
| `staleTime` | 30 seconds (set globally in `Providers.tsx`) |
| `retry` | 1 (set globally) |
| `refetchOnWindowFocus` | `false` (set globally) |
| Invalidation | Always `qc.invalidateQueries({ queryKey: ['resource'] })` on mutation success |
| Cache warming | Use `qc.setQueryData` or prefetch when navigating to detail views |
| QueryClient local | Always name it `qc = useQueryClient()` |

---

## Form Handling Rules

- **No form library** — use `useState<FormInterface>` with functional updater: `setForm(f => ({ ...f, field: val }))`.
- Number fields: store as `string` in form state, convert with `parseFloat()` at submit.
- Date fields: store as `string` in form state (`YYYY-MM-DD`), send as-is to BE.
- Minimal client-side validation — only required field checks for UX. Full validation is BE-side.
- Server errors: display in `<Alert severity="error">` inside the Dialog.
- Save button disabled while `saving = createMutation.isPending || updateMutation.isPending`.

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Page component | `export default function XxxsPage()` | `MaterialsPage` |
| API service export | camelCase object | `materialsApi`, `unitConversionsApi` |
| Query keys | string or tuple | `['materials']`, `['production', date]` |
| Form interface | `XxxForm` | `MaterialForm` |
| Default form constant | `defaultForm` | — |
| Edit target state | `editTarget: Model \| null` | — |
| Delete target state | `deleteTarget: Model \| null` | — |
| Saving flag | `saving` | `createMutation.isPending \|\| updateMutation.isPending` |

---

## MUI Component Guidelines

- Use `<Table size="small">` for data tables.
- `<Paper>` wraps all tables.
- Row hover: `<TableRow hover>`.
- Action buttons: `<IconButton size="small">` with `EditIcon` / `DeleteIcon`.
- Dialogs: `fullWidth maxWidth="sm"` for standard forms.
- `<Select>` for enum fields — always paired with `<FormControl>` + `<InputLabel>`.
- `<Alert severity="error">` for inline form errors.
- Loading state: `<CircularProgress size={24} />` inside a `TableRow` spanning all columns.
- Currency: always prefix monetary values with `₱` (Philippine Peso).

---

## Advanced Pattern: DataGrid with Pending Changes

For complex, spreadsheet-like pages (e.g., `production/page.tsx`):
- Use `@mui/x-data-grid` with `processRowUpdate`.
- Collect edits into a `Map` (e.g., `pendingChanges: Map<id, partialData>`).
- Show a sticky "N unsaved changes" banner with Save / Discard buttons.
- Reset pending state via `useEffect` when a filter (date, branch) changes.
- Build columns dynamically using `useMemo` when column count depends on fetched data.
- Use `useGridApiRef` for programmatic DataGrid control.

---

## Environment Variables (`.env.local`)

```
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

---

## Post-Change Analysis (Ruflo + Copilot)

After implementing code changes, run Ruflo analysis in terminal before finalizing:

1. Complexity scan on touched areas:
  - `npx @claude-flow/cli@latest analyze complexity louella-be/src --threshold 15`
  - `npx @claude-flow/cli@latest analyze complexity louella-web/src --threshold 15`
2. Circular dependency check:
  - `npx @claude-flow/cli@latest analyze circular louella-be/src`
  - `npx @claude-flow/cli@latest analyze circular louella-web/src`
3. If issues are found, apply refactors/fixes, then rerun the same checks.
4. Validate project build/test commands for changed projects.
5. Write key analysis findings to a persistent repo note in `.claude-flow/workflows/ruflo-findings-log.md`.
   - Include: date, task summary, top complexity findings, circular dependency result, actions taken, and remaining risks.
6. Store a compact task memory entry after completing the task:
  - `npx @claude-flow/cli@latest memory store -k "task:<timestamp>:<short-slug>" -v "<task summary>; files touched; key decisions; risks"`
7. If the change is meaningful and analysis was not run (or was deferred), explicitly remind the user to run:
  - `npx @claude-flow/cli@latest analyze complexity louella-be/src --threshold 15`
  - `npx @claude-flow/cli@latest analyze complexity louella-web/src --threshold 15`
  - `npx @claude-flow/cli@latest analyze circular louella-be/src`
  - `npx @claude-flow/cli@latest analyze circular louella-web/src`

Notes:
- Use Ruflo as an analysis layer; Copilot performs actual file edits and implementation.
- `swarm` objectives are optional for broad recommendations, but do not replace direct implementation and verification.
- For very small edits (e.g., typo/UI text only), complexity scan can be skipped, but circular checks and build validation are still preferred when practical.
- Keep memory values concise and implementation-focused (no secrets, no credentials, no token values).
