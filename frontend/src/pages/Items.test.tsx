import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { Navbar } from '../components/Navbar';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { Items } from './Items';

vi.mock('../api/client', () => ({
  apiClient: {
    createItem: vi.fn(),
    deleteItem: vi.fn(),
    getAvailableMetals: vi.fn(),
    getEntitlement: vi.fn(),
    getItems: vi.fn(),
    getItemsSummary: vi.fn(),
    getLatestItem: vi.fn(),
    logout: vi.fn(),
    updateItem: vi.fn(),
    version: vi.fn(),
  },
}));
vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

const membership = {
  shop_id: 'shop-1',
  shop_name: 'Demo Shop',
  shop_slug: 'demo-shop',
  role: 'OWNER' as const,
};

const renderInventoryWithNavbar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Navbar
          collapsed={false}
          mobileOpen={false}
          onToggleCollapsed={vi.fn()}
          onCloseMobile={vi.fn()}
        />
        <Items />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Inventory entitlement usage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfig).mockReturnValue({
      appName: 'Aurum POS',
      isDarkMode: false,
      toggleDarkMode: vi.fn(),
    });
    vi.mocked(useShop).mockReturnValue({
      user: {
        user_id: 'user-1',
        email: 'owner@example.com',
        full_name: 'Owner',
        memberships: [membership],
      },
      memberships: [membership],
      activeMembership: membership,
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(apiClient.getEntitlement)
      .mockResolvedValueOnce({
        plan: 'free',
        source: 'hosted_free',
        active_item_limit: 50,
        active_item_count: 12,
        can_add_item: true,
        expires_at: null,
      })
      .mockResolvedValue({
        plan: 'free',
        source: 'hosted_free',
        active_item_limit: 50,
        active_item_count: 13,
        can_add_item: true,
        expires_at: null,
      });
    vi.mocked(apiClient.getAvailableMetals).mockResolvedValue({ Silver: [92.5] });
    vi.mocked(apiClient.getLatestItem).mockRejectedValue(new Error('No item'));
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      pages: 0,
    });
    vi.mocked(apiClient.getItemsSummary).mockResolvedValue({
      total_items: 0,
      in_stock: 0,
      unique_items: 0,
      sold_items: 0,
      items_925_count: 0,
    });
    vi.mocked(apiClient.createItem).mockResolvedValue({
      id: 'item-1',
      sku: 'RING-1',
      barcode: '12345678',
      category: 'jewellery',
      name: 'Silver Ring',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    });
    vi.mocked(apiClient.version).mockResolvedValue({
      version: '0.1.0',
      revision: 'abc123',
      license: 'AGPL-3.0-only',
      source: 'https://github.com/duelistraj/aurum-pos',
      deployment_mode: 'hosted',
    });
  });

  it('refreshes the shared active-item count after adding inventory', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();

    await user.click(screen.getByRole('button', { name: 'Account and settings' }));
    expect(await screen.findByText('12/50 active items')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    await user.type(within(dialog).getByPlaceholderText('e.g., GLD-001'), 'RING-1');
    await user.type(within(dialog).getByPlaceholderText('e.g., Gold Ring'), 'Silver Ring');
    const decimalInputs = within(dialog).getAllByPlaceholderText('0.00');
    await user.type(decimalInputs[0], '5');
    await user.type(decimalInputs[1], '100');
    await user.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    await waitFor(() => expect(apiClient.createItem).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Account and settings' }));
    expect(await screen.findByText('13/50 active items')).toBeInTheDocument();
  });
});
