import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProdRow } from './useProductionRowUpdate';
import { useYieldAutoSync } from './useProductionPlannedYield';

const row = (y: number): ProdRow => ({ id: 3, productId: 3, type: 'BREAD', _productionId: 1, yield: y });

describe('useYieldAutoSync', () => {
  it('does not add the plan on top of a yield finalizing already booked when the orders load late', () => {
    const handleFieldChange = vi.fn();
    type P = { rows: ProdRow[]; planned: Map<number, number>; ready: boolean };
    const { rerender } = renderHook((p: P) =>
      useYieldAutoSync({
        allRows: p.rows,
        plannedByProduct: p.planned,
        pendingProduction: new Map(),
        handleFieldChange,
        filterDate: '2026-10-25',
        plannedReady: p.ready,
      }),
      { initialProps: { rows: [] as ProdRow[], planned: new Map<number, number>(), ready: false } },
    );
    const rows = [row(10)]; // the kitchen already has the finalized order's 10
    rerender({ rows, planned: new Map(), ready: false }); // rows first…
    rerender({ rows, planned: new Map([[3, 10]]), ready: true }); // …then the orders
    expect(handleFieldChange).not.toHaveBeenCalled();
  });

  it('still follows an order finalized while the board is open', () => {
    const handleFieldChange = vi.fn();
    const rows = [row(10)];
    const { rerender } = renderHook((p: { planned: Map<number, number> }) =>
      useYieldAutoSync({
        allRows: rows,
        plannedByProduct: p.planned,
        pendingProduction: new Map(),
        handleFieldChange,
        filterDate: '2026-10-25',
        plannedReady: true,
      }),
      { initialProps: { planned: new Map([[3, 10]]) } },
    );
    rerender({ planned: new Map([[3, 15]]) });
    expect(handleFieldChange).toHaveBeenCalledWith(rows[0], 'yield', 15);
  });
});
