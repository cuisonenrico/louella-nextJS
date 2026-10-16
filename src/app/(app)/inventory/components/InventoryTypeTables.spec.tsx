import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Inventory, Product, ProductType } from '@/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import InventoryTypeTables from './InventoryTypeTables';

const product = { id: 1, name: 'Pandesal', type: 'BREAD', price: 4, sortOrder: 0, isActive: true } as Product;
const row: Inventory = {
  id: 9, branchId: 1, productId: 1, createdById: null, quantity: 10, delivery: 30, leftover: 5, reject: 1,
  date: '2026-10-16', notes: null, createdAt: '', updatedAt: '', adjustments: [], effectivePrice: 4,
  leftoverCountedAt: '2026-10-16T10:00:00Z',
};

function renderTables(opts: { isRange?: boolean; showRevenue: boolean }) {
  render(
    <TooltipProvider>
      <InventoryTypeTables
        rowsByType={new Map<ProductType, Inventory[]>([['BREAD', [row]]])}
        productById={new Map([[1, product]])}
        pendingUpdates={new Map()}
        isRange={opts.isRange ?? false}
        isEditable={false}
        hasBranchFilter
        canAdjust={false}
        showRevenue={opts.showRevenue}
        onAdjustmentsOpen={vi.fn()}
        onCellChange={vi.fn()}
      />
    </TooltipProvider>,
  );
  return screen.getAllByRole('columnheader').map((h) => h.textContent?.trim());
}

describe('InventoryTypeTables columns', () => {
  it('shows Stock ₱ after Total Stock, and Revenue when allowed', () => {
    expect(renderTables({ showRevenue: true })).toEqual([
      'Product', 'Prev. Leftover', 'Delivery', 'Adjustments', 'Total Stock', 'Stock ₱', 'Leftover', 'Reject', 'Sold', 'Revenue',
    ]);
  });

  it('drops Revenue without the revenue permission', () => {
    expect(renderTables({ showRevenue: false })).toEqual([
      'Product', 'Prev. Leftover', 'Delivery', 'Adjustments', 'Total Stock', 'Stock ₱', 'Leftover', 'Reject', 'Sold',
    ]);
  });

  it('has no on-hand columns in range mode', () => {
    const headers = renderTables({ isRange: true, showRevenue: true });
    expect(headers).not.toContain('Total Stock');
    expect(headers).not.toContain('Stock ₱');
  });

  it('prices the stock on hand', () => {
    renderTables({ showRevenue: false });
    const r = screen.getByRole('row', { name: /Pandesal/ });
    // on hand = 10 + 30 = 40, at ₱4
    expect(within(r).getByText('₱160')).toBeInTheDocument();
  });
});
