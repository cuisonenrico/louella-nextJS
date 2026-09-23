import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithQuery } from '@/test/renderWithQuery';

const auth = { permissions: [] as string[] };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const api = {
  pendingTransfers: vi.fn(),
  acceptTransfer: vi.fn().mockResolvedValue({ data: {} }),
  rejectTransfer: vi.fn().mockResolvedValue({ data: {} }),
};
vi.mock('@/lib/apiServices', () => ({ inventoryAdjustmentsApi: api }));

const { default: PendingTransfersPanel } = await import('./PendingTransfersPanel');

const transfer = (over: Record<string, unknown> = {}) => ({
  id: 9,
  value: 10,
  notes: null,
  createdAt: '2026-09-23T01:00:00Z',
  date: '2026-09-23T00:00:00.000Z',
  product: { id: 7, name: 'Pandesal' },
  fromBranch: { id: 1, name: 'Main' },
  toBranch: { id: 2, name: 'Cubao' },
  direction: 'incoming',
  canRespond: true,
  ...over,
});

describe('PendingTransfersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = ['inventory-adjustments', 'inventory-adjustments:transfer'];
  });

  it('lets the receiving branch accept an incoming transfer', async () => {
    api.pendingTransfers.mockResolvedValue({ data: [transfer()] });
    renderWithQuery(<PendingTransfersPanel branchId={2} />);

    await userEvent.click(await screen.findByRole('button', { name: /accept/i }));

    await waitFor(() => expect(api.acceptTransfer).toHaveBeenCalledWith(9));
    expect(api.pendingTransfers).toHaveBeenCalledWith(2);
  });

  it('lets the receiving branch reject an incoming transfer', async () => {
    api.pendingTransfers.mockResolvedValue({ data: [transfer()] });
    renderWithQuery(<PendingTransfersPanel branchId={2} />);

    await userEvent.click(await screen.findByRole('button', { name: /reject/i }));

    await waitFor(() => expect(api.rejectTransfer).toHaveBeenCalledWith(9));
  });

  it('shows the sender that it is still awaiting the receiver, with no buttons', async () => {
    api.pendingTransfers.mockResolvedValue({
      data: [transfer({ direction: 'outgoing', canRespond: false })],
    });
    renderWithQuery(<PendingTransfersPanel branchId={1} />);

    expect(await screen.findByText('Awaiting Cubao')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
  });

  it('renders nothing when nothing is pending', async () => {
    api.pendingTransfers.mockResolvedValue({ data: [] });
    const { container } = renderWithQuery(<PendingTransfersPanel />);

    await waitFor(() => expect(api.pendingTransfers).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('does not ask for transfers without the adjustments permission', async () => {
    auth.permissions = ['dashboard'];
    const { container } = renderWithQuery(<PendingTransfersPanel />);

    expect(container).toBeEmptyDOMElement();
    expect(api.pendingTransfers).not.toHaveBeenCalled();
  });
});
