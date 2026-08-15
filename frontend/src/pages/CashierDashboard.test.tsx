import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { CashierDashboard } from './CashierDashboard';

vi.mock('../api/client', () => ({ apiClient: { getCashierDashboardSummary: vi.fn() } }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

describe('CashierDashboard', () => {
  afterEach(cleanup);

  it('renders four daily metrics and the latest sold activity', async () => {
    vi.mocked(useShop).mockReturnValue({
      user: { user_id: 'user-1', email: 'cashier@example.com', full_name: 'Cashier User', memberships: [] },
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
    vi.mocked(apiClient.getCashierDashboardSummary).mockResolvedValue({
      today_sales: 1500,
      invoice_count: 2,
      units_sold: 3,
      recent_sold_activity: Array.from({ length: 4 }, (_, index) => ({
        id: `entry-${index + 1}`,
        item_id: `item-${index + 1}`,
        item_name: `Gold item ${index + 1}`,
        sku: `RING-${index + 1}`,
        barcode: `1234567${index + 1}`,
        invoice_no: `INV-2026-00000${index + 1}`,
        quantity: 1,
        weight_grams: null,
        amount: 1500,
        created_at: `2026-08-15T08:3${index}:00Z`,
      })),
      metal_rates: [
        { metal: 'gold', rate_per_10g: 75000 },
        { metal: 'silver', rate_per_10g: 1000 },
        { metal: 'platinum', rate_per_10g: 42000 },
      ],
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CashierDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Today's Sales")).toBeInTheDocument();
    expect(screen.getByText('Invoices Today')).toBeInTheDocument();
    expect(screen.getByText('Units Sold')).toBeInTheDocument();
    expect(screen.getByText('Gold Rate per 10g')).toBeInTheDocument();
    expect(screen.queryByText('Silver Rate per 10g')).not.toBeInTheDocument();
    expect(screen.queryByText('Platinum Rate per 10g')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('Item sold: 12345671')).toBeInTheDocument();
    expect(screen.getByText('Item sold: 12345673')).toBeInTheDocument();
    expect(screen.queryByText('Item sold: 12345674')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });
});
