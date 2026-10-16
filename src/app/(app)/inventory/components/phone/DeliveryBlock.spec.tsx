import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DeliveryBlock from './DeliveryBlock';

const props = { editing: false, editable: true, onEdit: vi.fn(), onChange: vi.fn() };

describe('DeliveryBlock', () => {
  it('says how a delivery differs from the order before anyone taps in', () => {
    render(<DeliveryBlock value={13} ordered={5} {...props} />);
    expect(screen.getByText('Ordered 5 · 8 over')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Different count?' })).toBeInTheDocument();
  });

  it('says short when less arrived', () => {
    render(<DeliveryBlock value={22} ordered={24} {...props} />);
    expect(screen.getByText('Ordered 24 · 2 short')).toBeInTheDocument();
  });

  it('shows only the match badge when it matches', () => {
    render(<DeliveryBlock value={24} ordered={24} {...props} />);
    expect(screen.getByText('✓ matches order')).toBeInTheDocument();
    expect(screen.queryByText(/^Ordered/)).toBeNull();
  });
});
