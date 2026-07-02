/**
 * Shared class strings for the spreadsheet look: thin ruled gridlines on
 * every cell, a dense sticky header, and compact section-banner rows.
 * Used by every editable grid so the "sheet" reads the same across the app.
 */

/** Sticky column-header cell. */
export const SHEET_HEAD =
  'sticky top-0 z-10 h-8 bg-muted px-2 text-xs font-semibold text-muted-foreground border-b border-r border-border last:border-r-0';

/** Ruled body cell. */
export const SHEET_CELL = 'border-b border-r border-border last:border-r-0 h-8';

/** Full-width section-banner cell (colSpan across all columns). */
export const SHEET_BANNER =
  'h-7 bg-muted/60 px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border';

/** Container classes for the scrollable sheet (pass as Table containerClassName). */
export const SHEET_CONTAINER = 'max-h-[70vh] rounded-md border border-border bg-background';

/** Table classes for the sheet (keeps gridlines crisp under sticky headers). */
export const SHEET_TABLE = 'border-separate border-spacing-0';
