/**
 * Shared class strings for the spreadsheet look: thin ruled gridlines on
 * every cell, a dense sticky header, and compact section-banner rows.
 * Used by every editable grid so the "sheet" reads the same across the app.
 */

/** Sticky column-header cell. */
export const SHEET_HEAD =
  'sticky top-0 z-10 h-8 bg-muted px-2 text-xs font-semibold text-muted-foreground border-b border-r border-border last:border-r-0';

/**
 * Ruled body cell.
 *
 * `p-0` is load-bearing: the TableCell primitive's base `p-4` is only half
 * beaten by the `px-*` each consumer adds, so without it every row keeps 16px
 * of vertical padding and stands ~72px tall instead of the 32px `h-8` asks
 * for. Consumers still layer their own `px-*` on top.
 */
export const SHEET_CELL = 'border-b border-r border-border last:border-r-0 h-8 p-0';

/** Full-width section-banner cell (colSpan across all columns). */
export const SHEET_BANNER =
  'h-7 p-0 px-2 bg-muted/60 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border';

/**
 * Container classes for the scrollable sheet (pass as Table containerClassName).
 *
 * `dvh` not `vh`: `vh` measures the large viewport, so a 70vh cap is taller than
 * the screen while mobile browser chrome is showing and the grid overflows the
 * page instead of scrolling inside itself.
 */
export const SHEET_CONTAINER = 'max-h-[70dvh] rounded-md border border-border bg-background';

/** Table classes for the sheet (keeps gridlines crisp under sticky headers). */
export const SHEET_TABLE = 'border-separate border-spacing-0';
