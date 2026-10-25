import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductType } from '@/types';
import type { ProdRow } from '../../hooks/useProductionRowUpdate';
import BoardList, { type BoardRowView } from './BoardList';

const row = { id: 3, productId: 3, type: 'BREAD', _productionId: 1, yield: 0 } as ProdRow;
const rowsByType = new Map<ProductType, ProdRow[]>([['BREAD', [row]]]);

function renderRow(v: Partial<BoardRowView>, readOnly = false) {
  const full: BoardRowView = { row, name: 'Buns Big', planned: 13, yieldVal: 13, assigned: 13, over: false, branchesWithShare: 1, ownShare: 8, ...v };
  render(<BoardList rowsByType={rowsByType} view={() => full} onOpen={vi.fn()} readOnly={readOnly} />);
  return screen.getByRole('button', { name: /^Buns Big/ });
}

describe('BoardList', () => {
  it('shows – for the difference when nothing has yield', () => {
    const r = renderRow({ yieldVal: 0, assigned: 0, branchesWithShare: 0 });
    expect(within(r).getByText('–', { selector: '[data-field="diff"]' })).toBeInTheDocument();
  });

  it('says how much is still unassigned', () => {
    const r = renderRow({ yieldVal: 15, assigned: 10 });
    expect(within(r).getByText('assigned 10 of 15')).toBeInTheDocument();
  });

  it('says all assigned only when it all is', () => {
    const r = renderRow({});
    expect(within(r).getByText('to 1 branch · all assigned')).toBeInTheDocument();
  });

  it('a read-only viewer sees planned and their own share, not the kitchen yield', () => {
    const r = renderRow({ ownShare: 8 }, true);
    expect(r.querySelector('[data-field="yield"]')).toBeNull();
    expect(r.querySelector('[data-field="diff"]')).toBeNull();
    expect(within(r).getByText('8', { selector: '[data-field="share"]' })).toBeInTheDocument();
    expect(screen.getByText('Yours')).toBeInTheDocument();
  });
});
