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
  it('shows each count with its pesos beside it, Stock ₱ after Total Stock, and Revenue when allowed', () => {
    expect(renderTables({ showRevenue: true })).toEqual([
      'Product', 'Prev. Leftover', 'Delivery', 'Delivery ₱', 'Adjustments', 'Total Stock', 'Stock ₱',
      'Leftover', 'Leftover ₱', 'Reject', 'Reject ₱', 'Sold', 'Revenue',
    ]);
  });

  it('drops Revenue without the revenue permission', () => {
    expect(renderTables({ showRevenue: false })).toEqual([
      'Product', 'Prev. Leftover', 'Delivery', 'Delivery ₱', 'Adjustments', 'Total Stock', 'Stock ₱',
      'Leftover', 'Leftover ₱', 'Reject', 'Reject ₱', 'Sold',
    ]);
  });

  it('has no on-hand columns in range mode', () => {
    const headers = renderTables({ isRange: true, showRevenue: true });
    expect(headers).not.toContain('Total Stock');
    expect(headers).not.toContain('Stock ₱');
    expect(headers).not.toContain('Delivery ₱');
  });

  it('prices delivery, leftover and reject at the row price, and subtotals them', () => {
    const headers = renderTables({ showRevenue: true });
    const cells = (name: RegExp) =>
      within(screen.getByRole('row', { name })).getAllByRole('cell').map((c) => c.textContent?.trim());
    const at = (row: (string | undefined)[], header: string) => row[headers.indexOf(header)];
    const r = cells(/Pandesal/);
    // 30 delivered, 5 left, 1 rejected, at ₱4
    expect(at(r, 'Delivery ₱')).toBe('₱120');
    expect(at(r, 'Leftover ₱')).toBe('₱20');
    expect(at(r, 'Reject ₱')).toBe('₱4');
    const sub = screen.getByRole('row', { name: /Bread subtotal/ });
    for (const v of ['₱120', '₱20', '₱4']) expect(within(sub).getByText(v)).toBeInTheDocument();
  });

  it('prices the stock on hand', () => {
    renderTables({ showRevenue: false });
    const r = screen.getByRole('row', { name: /Pandesal/ });
    // on hand = 10 + 30 = 40, at ₱4
    expect(within(r).getByText('₱160')).toBeInTheDocument();
  });

  it("ends each category with its sold and revenue subtotal", () => {
    renderTables({ showRevenue: true });
    // sold = 10 + 30 − 5 − 1 = 34, at ₱4
    const subtotal = screen.getByRole('row', { name: /Bread subtotal/ });
    expect(within(subtotal).getByText('34')).toBeInTheDocument();
    expect(within(subtotal).getByText('₱136')).toBeInTheDocument();
  });

  it('subtotal leaves out revenue without the revenue permission', () => {
    renderTables({ showRevenue: false });
    const subtotal = screen.getByRole('row', { name: /Bread subtotal/ });
    expect(within(subtotal).queryByText('₱136')).toBeNull();
  });
});
