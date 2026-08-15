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

  it('renders five daily metrics and the latest sold activity', async () => {
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
      recent_sold_activity: [{
        id: 'entry-1',
        entity: 'item',
        action: 'sold',
        payload: {
          barcode: '12345678',
          invoice_no: 'INV-2026-000001',
          quantity: 1,
          weight_grams: null,
          pricing: { total_price: 1500 },
        },
        created_at: '2026-08-15T08:30:00Z',
      }],
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
    expect(screen.getByText('Gold Rate per 10g')).toBeInTheDocument();
    expect(screen.getByText('Silver Rate per 10g')).toBeInTheDocument();
    expect(screen.getByText('Platinum Rate per 10g')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(5);
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.getByText('Item sold: 12345678')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });
});
