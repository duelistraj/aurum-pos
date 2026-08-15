import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { CashierInventory } from './CashierInventory';

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/client')>();
  return { ...original, apiClient: { ...original.apiClient, getCashierItemByBarcode: vi.fn() } };
});
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <CashierInventory />
  </QueryClientProvider>,
);

describe('CashierInventory', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: {
        shop_id: 'shop-1', organization_id: 'org-1', organization_name: 'Aurum',
        is_primary: true, access_mode: 'read_write', shop_name: 'Demo', shop_slug: 'demo',
        role: 'CASHIER',
      },
      canManage: false,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('looks up only after 8 digits and renders only cashier-safe fields', async () => {
    vi.mocked(apiClient.getCashierItemByBarcode).mockResolvedValue({
      barcode: '12345678', sku: 'RING-1', name: 'Gold Ring', category: 'ring',
      item_type: 'jewellery', metal: 'gold', purity: 91.6, net_weight: 4.5,
      ratti: null, status: 'in_stock', hsn: '7113', gst_rate_percent: 3,
      price: { state: 'available', amount: 12345 },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Barcode'), '1234567x8');
    await waitFor(() => expect(apiClient.getCashierItemByBarcode).toHaveBeenCalledWith('12345678'));
    expect(await screen.findByRole('heading', { name: 'Gold Ring' })).toBeInTheDocument();
    expect(screen.getByText('₹12,345.00')).toBeInTheDocument();
    expect(screen.queryByText(/quantity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stock value/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
