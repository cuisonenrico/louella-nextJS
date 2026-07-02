'use client';

import { useCallback, useMemo } from 'react';
import { neighbor } from '@/lib/sheet';

/**
 * Excel-style grid navigation for a sheet of editable cells.
 *
 * The sheet is modelled as `rowIds × cols`; two flat orderings drive movement:
 * - column order (same col, prev/next row) for Up / Down / Enter
 * - linear order (row-major across editable cols) for Left / Right / Tab
 *
 * Cells that don't exist in the DOM (e.g. a row without a record for that
 * column) are skipped, and the cursor stops at the sheet bounds rather than
 * wrapping — matching Excel.
 */
export function useSheetNavigation<Col extends string>(
  rowIds: number[],
  cols: readonly Col[],
  getInputId: (rowId: number, col: Col) => string,
) {
  const linearInputIds = useMemo(
    () => rowIds.flatMap((rowId) => cols.map((col) => getInputId(rowId, col))),
    [rowIds, cols, getInputId],
  );

  const focusInputById = useCallback((inputId: string) => {
    const el = document.getElementById(inputId) as HTMLInputElement | null;
    if (!el) return false;
    el.focus();
    el.select();
    return true;
  }, []);

  // Same col, prev/next row — skipping any row whose input is missing.
  const moveInColumn = useCallback(
    (rowId: number, col: Col, dir: 1 | -1) => {
      let id = neighbor(rowIds, rowId, dir);
      while (id !== null) {
        if (focusInputById(getInputId(id, col))) return;
        id = neighbor(rowIds, id, dir);
      }
    },
    [rowIds, getInputId, focusInputById],
  );

  // Prev/next editable cell in linear order; returns whether focus moved.
  const moveLinear = useCallback(
    (currentInputId: string, dir: 1 | -1): boolean => {
      let id = neighbor(linearInputIds, currentInputId, dir);
      while (id !== null) {
        if (focusInputById(id)) return true;
        id = neighbor(linearInputIds, id, dir);
      }
      return false;
    },
    [linearInputIds, focusInputById],
  );

  return { moveInColumn, moveLinear };
}
