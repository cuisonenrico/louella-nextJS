# Inventory Details — Spreadsheet-Style Grid

**Date:** 2026-06-30
**Status:** Approved (design)
**Area:** `louella-web` — `src/app/inventory/details`

## Problem

The client previously recorded inventory in printed Excel sheets. The web
Inventory Details table must *feel the same* to record into. The current table
is already an editable grid (inline Delivery/Leftover/Reject inputs, Enter and
Tab navigation, batched pending changes, computed Total Stock / Sold / Revenue),
but it reads as a web form, not a spreadsheet, and lacks full arrow-key
navigation.

## Goal

Two things, scoped from client clarification:

1. **Spreadsheet look** — visible gridlines, dense rows, every cell looks
   editable, an active-cell highlight.
2. **Keyboard grid navigation** — a single continuous cursor that flows across
   the product-type groups, with up/down/left/right arrow movement.

The edit model stays **always-input** (live inputs in every editable cell) with
arrow jumping added; left/right jump between cells only when the caret is at the
start/end of the number.

## Out of Scope (explicitly not building)

- Copy / paste, drag fill-down, range selection
- Real `.xlsx` import / export, embedded Excel
- Spreadsheet engine libraries (react-spreadsheet, Glide Data Grid, AG Grid)
- Frozen first column

## Approach

**Single continuous sheet (Approach B).** Collapse the four per-type `<Table>`s
into one `<Table>` with full-width banner rows between sections. Gives one
sticky column header, guaranteed column alignment, and a true "scroll straight
down one sheet" feel. The navigation infrastructure keys off element IDs, not
DOM order, so it ports over directly.

Rejected alternatives:
- *Restyle in place (keep four tables)* — lower risk but reads as four small
  sheets with repeated headers; undercuts the continuous-sheet goal.
- *Spreadsheet library* — overkill given no copy/paste/xlsx need; adds bundle
  weight and fights the existing computed columns, adjustments dialog, and
  pending-changes model.

## Component Structure

The refactor is confined to the rendering layer. `details/page.tsx`, all
mutations, `pendingUpdates`, the computed helpers in `useInventoryColumns.ts`,
and the adjustments / cascade dialogs are **untouched**. No new files, no new
dependencies.

### `InventoryTypeTables.tsx` — single-sheet renderer
- Emits **one** `<Table>` instead of one per type.
- One sticky `<TableHeader>` — column headers rendered once, pinned on vertical
  scroll.
- For each non-empty type in `PRODUCT_TYPE_ORDER`: a full-width **banner row**
  (`colSpan` across all columns) as the section divider, followed by that type's
  `InventoryTableRow`s.
- Continues to own the navigation model: the flat `orderedRowIds` (column-wise)
  and `linearInputIds` (linear, both already cross-type), plus the focus-by-id
  helpers. Adds an Up-arrow handler and cursor-aware Left/Right handlers next to
  the existing Enter (`handleEnterNextInColumn`) and Tab (`handleTabNextInput`)
  handlers.

### `InventoryTableRow.tsx` — mostly unchanged
- The three editable cells switch from shadcn `<Input type="number">` to a flat,
  full-cell `type="text"` `inputMode="numeric"` input (digit-filtered,
  non-negative integer). The type switch is required so `selectionStart` is
  reliably reported for caret-aware Left/Right (number inputs return `null`).
- `onKeyDown` gains ArrowUp / ArrowDown / ArrowLeft / ArrowRight handling.
- Read-only / range mode keeps rendering plain right-aligned text (no inputs).

## Navigation Behavior

Editable cells per row: **Delivery, Leftover, Reject**. Computed columns sit
between them and are **skipped** by the cursor. Two flat orderings drive
movement (both already exist in `InventoryTypeTables`):

- **Column order** per field — `[row1.delivery, row2.delivery, …]` — Up/Down.
- **Linear order** — `[row1.delivery, row1.leftover, row1.reject, row2.delivery,
  …]` — Left/Right and Tab.

| Key | Action |
|-----|--------|
| Down / Enter | Same field, next row (wraps across type groups). *Enter exists.* |
| Up | Same field, previous row (new). |
| Right | Caret at end of number → next editable cell (linear). Else move caret right. |
| Left | Caret at start of number → previous editable cell (linear). Else move caret left. |
| Tab / Shift+Tab | Next / previous editable cell (linear). *Exists.* |

- Banner rows are inert — navigation jumps over them (keyed by input element ID,
  not DOM position).
- At the first/last cell the cursor **stops** (no wrap-around to the opposite
  end), matching Excel.

## Visual Treatment

- **Gridlines:** every cell `border-r` + `border-b` (thin, muted); outer border
  on the table.
- **Dense rows:** reduced cell padding, ~28–30px row height, smaller text,
  `tabular-nums`, right-aligned numbers so digits align.
- **Cells look editable:** input fills the whole cell — transparent background,
  no rounded border. The cell lights up (blue ring/inset + light blue fill) only
  when focused — the active-cell highlight.
- **Sticky header:** the single column-header row stays pinned on scroll.
- **Section banners:** compact, slightly shaded full-width rows (e.g. "BREAD")
  replacing the four repeated headers.
- **Read-only / range mode:** cells render as plain right-aligned text, still
  ruled.

## Edge Cases

- **Empty input** → treated as `0` on parse (preserves current behavior).
- **Input filtering** → digits only; letters, symbols, and negatives blocked.
- **`selectionStart`** → reliable because cells are now `type="text"`.
- **Pending highlight** → the existing amber unsaved-row tint coexists with the
  focus highlight; focus wins on the active cell.

## Testing

- Existing `useInventoryColumns.spec.ts` coverage remains valid.
- Add a unit test for the digit-filter / parse helper (empty → 0, strips
  non-digits, blocks negatives).
- Cover the pure navigation-ordering helpers (next/prev in column, next/prev
  linear, skipping banner rows) with unit tests rather than full jsdom focus
  simulation, since the rest is DOM-focus behavior.
