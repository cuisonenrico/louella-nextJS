# louella-web — Next.js Frontend Copilot Instructions

## Active Skills (Always Apply)

These skills must be read and applied on every prompt in this project:

| Skill | Path | When to Apply |
|---|---|---|
| `vercel-react-best-practices` | `../.agents/skills/vercel-react-best-practices/SKILL.md` | All React component work, data fetching, bundle optimization, and Next.js pages |
| `find-skills` | `../.agents/skills/find-skills/SKILL.md` | When asked about agent capabilities or discovering new tools |

Before writing any React component, Next.js page, or data-fetching code, read `vercel-react-best-practices/SKILL.md` and apply its rules.

---

## Stack
- **Framework:** Next.js 16 (App Router), TypeScript 5, React 19
- **UI Components:** shadcn/ui (Radix-based — `components.json` governs component generation)
- **Data Fetching:** TanStack Query v5 (React Query)
- **HTTP Client:** Axios (`src/lib/api.ts`)
- **Date Handling:** dayjs
- **Auth State:** React Context (`src/contexts/AuthContext.tsx`)
- **Icons:** `lucide-react`

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
    errors.ts              ← shared extractError() utility
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
type ProductType = 'BREAD' | 'CAKE' | 'SPECIAL' | 'MISCELLANEOUS';
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
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import AuthGuard from '@/components/AuthGuard';
import { xxxApi } from '@/lib/apiServices';
import { extractError } from '@/lib/errors';
import type { Xxx } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

// ── Form state (numbers stored as strings until submit) ──────────────────
interface XxxForm {
  name: string;
  value: string;
}
const defaultForm: XxxForm = { name: '', value: '' };

export default function XxxsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Xxx | null>(null);
  const [form, setForm] = useState<XxxForm>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Xxx | null>(null);
  const [formError, setFormError] = useState('');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['xxxs'],
    queryFn: () => xxxApi.list().then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Xxx>) => xxxApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['xxxs'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Xxx> }) => xxxApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['xxxs'] }); setDialogOpen(false); },
    onError: (err) => setFormError(extractError(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => xxxApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['xxxs'] }); setDeleteTarget(null); },
  });

  const openCreate = () => { setEditTarget(null); setForm(defaultForm); setFormError(''); setDialogOpen(true); };
  const openEdit = (item: Xxx) => {
    setEditTarget(item);
    setForm({ name: item.name, value: String(item.value) });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    const payload = { name: form.name.trim(), value: parseFloat(form.value) };
    editTarget ? updateMutation.mutate({ id: editTarget.id, data: payload }) : createMutation.mutate(payload);
  };

  const saving = createMutation.isPending || updateMutation.isPending;
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AuthGuard>
      <AppLayout title="Xxxs">
        <div className="flex justify-between items-center mb-4">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Add Xxx</Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Value</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No xxxs found.</TableCell></TableRow>
              ) : filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.value}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(item)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editTarget ? 'Edit Xxx' : 'Add Xxx'}</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
              <div className="grid gap-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} autoFocus onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="value">Value</Label>
                <Input id="value" type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteTarget!.id)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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

Import the icon from `lucide-react`.

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

## shadcn/ui Component Guidelines

- Tables: `<Card>` wraps `<Table>` with `<TableHeader>` / `<TableBody>` / `<TableRow>` / `<TableHead>` / `<TableCell>`.
- Action buttons: `<Button variant="ghost" size="icon">` with lucide-react icons (`<Pencil>`, `<Trash2>`).
- Destructive actions: `className="text-destructive"` on the button.
- Modals: `<Dialog>` for forms, `<AlertDialog>` for destructive confirmations.
- Error messages: `<Alert variant="destructive"><AlertDescription>…</AlertDescription></Alert>`.
- Loading: `<Loader2 className="h-4 w-4 animate-spin" />`.
- Enum selects: `<Select>` + `<SelectTrigger>` + `<SelectContent>` + `<SelectItem>`.
- Never import from `@mui/material` — it is not installed.
- Currency: always prefix monetary values with `₱` (Philippine Peso).
- Navigation icons: import from `lucide-react`, not `@mui/icons-material`.

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

