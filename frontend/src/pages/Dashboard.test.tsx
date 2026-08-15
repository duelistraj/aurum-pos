import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { Dashboard } from './Dashboard';

vi.mock('../api/client', () => ({
  apiClient: {
    getDashboardSummary: vi.fn(),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

const summary = {
  inventory_items: 7,
  total_stock_value: 8400,
  Silver_rate_per_10g: 120.2,
  metal_rates: [
    { metal: 'gold', rate_per_10g: 72_000 },
    { metal: 'silver', rate_per_10g: 120.2 },
    { metal: 'platinum', rate_per_10g: 38_000 },
  ],
  total_sales_amount: 3200,
  total_sale_value: 11200,
  recent_activity: [
    {
      id: 'activity-1',
      entity: 'sale',
      action: 'create',
      payload: { invoice_no: 'INV-1001', total: 3200 },
      created_at: '2026-07-24T17:37:00.000Z',
    },
  ],
};

const renderDashboard = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Dashboard', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShop).mockReturnValue({
      user: {
        full_name: 'Admin User',
        user_id: 'user-1',
        email: 'admin@example.com',
        memberships: [],
      },
      memberships: [],
      activeMembership: {
        shop_id: 'shop-1',
        organization_id: 'organization-1',
        organization_name: 'Demo Organization',
        is_primary: true,
        access_mode: 'read_write',
        shop_name: 'Demo Shop',
        shop_slug: 'demo',
        role: 'OWNER',
      },
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders the existing metrics and activity feed with the new layout', async () => {
    vi.mocked(apiClient.getDashboardSummary).mockResolvedValue(summary);
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Welcome back, Admin' })).toBeInTheDocument();
    expect(await screen.findByText('₹3,200.00')).toBeInTheDocument();
    expect(screen.getByText('Gold rate')).toBeInTheDocument();
    expect(screen.getByText('₹72,000.00')).toBeInTheDocument();
    expect(screen.queryByText('Catalog value')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText(/\w+, \d{1,2} \w+ \d{4}/)).toBeInTheDocument();
    expect(await screen.findByText('Sale created: INV-1001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(screen.queryByRole('link', { name: 'View activity' })).not.toBeInTheDocument();
  });

  it('limits recent activity to three entries even if an older API returns more', async () => {
    vi.mocked(apiClient.getDashboardSummary).mockResolvedValue({
      ...summary,
      recent_activity: Array.from({ length: 4 }, (_, index) => ({
        id: `activity-${index + 1}`,
        entity: 'item',
        action: 'create',
        payload: { sku: `ITEM-${index + 1}` },
        created_at: `2026-07-24T17:3${index}:00.000Z`,
      })),
    });
    renderDashboard();

    expect(await screen.findByText('New item added: ITEM-1')).toBeInTheDocument();
    expect(screen.getByText('New item added: ITEM-3')).toBeInTheDocument();
    expect(screen.queryByText('New item added: ITEM-4')).not.toBeInTheDocument();
  });

  it('shows an actionable error when the summary request fails', async () => {
    vi.mocked(apiClient.getDashboardSummary).mockRejectedValue(new Error('Server unavailable'));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  it('shows a useful empty state when there is no activity', async () => {
    vi.mocked(apiClient.getDashboardSummary).mockResolvedValue({
      ...summary,
      recent_activity: [],
    });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('No recent activity yet')).toBeInTheDocument());
    expect(screen.getByText('Your latest sales and inventory updates will appear here.')).toBeInTheDocument();
  });
});
