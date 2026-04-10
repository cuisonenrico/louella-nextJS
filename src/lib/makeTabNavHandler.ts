import type { GridCellParams, useGridApiRef } from '@mui/x-data-grid';

type GridApiRef = ReturnType<typeof useGridApiRef>;

interface TabNavEvent {
  key: string;
  shiftKey: boolean;
  preventDefault(): void;
  defaultMuiPrevented?: boolean;
}

/**
 * Returns a DataGrid `onCellKeyDown` handler that moves the edit focus
 * between `editableFields` using Tab / Shift-Tab, wrapping across rows.
 *
 * @param editableFields - Ordered array of editable field names for this grid.
 * @param apiRef         - The grid API ref returned by `useGridApiRef()`.
 * @param enabled        - When false the handler is a no-op (e.g. in range mode).
 */
export function makeTabNavHandler(
  editableFields: string[],
  apiRef: GridApiRef,
  enabled = true,
) {
  return (params: GridCellParams, event: TabNavEvent): void => {
    if (!enabled || event.key !== 'Tab' || params.cellMode !== 'edit') return;
    const fieldIdx = editableFields.indexOf(params.field);
    if (fieldIdx === -1) return;
    event.preventDefault();
    event.defaultMuiPrevented = true;
    if (!apiRef.current) return;
    const sortedIds = apiRef.current.getSortedRowIds();
    const rowIdx = sortedIds.findIndex((id) => id === params.id);
    let targetId = params.id;
    let targetFieldIdx = event.shiftKey ? fieldIdx - 1 : fieldIdx + 1;
    if (targetFieldIdx < 0) {
      if (rowIdx <= 0) return;
      targetId = sortedIds[rowIdx - 1];
      targetFieldIdx = editableFields.length - 1;
    } else if (targetFieldIdx >= editableFields.length) {
      if (rowIdx >= sortedIds.length - 1) return;
      targetId = sortedIds[rowIdx + 1];
      targetFieldIdx = 0;
    }
    const nextField = editableFields[targetFieldIdx];
    apiRef.current.stopCellEditMode({ id: params.id, field: params.field });
    setTimeout(() => {
      apiRef.current!.startCellEditMode({ id: targetId, field: nextField });
    }, 0);
  };
}
