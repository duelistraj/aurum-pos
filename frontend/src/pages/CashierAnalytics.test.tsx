import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { CashierAnalytics } from './CashierAnalytics';

vi.mock('../api/client', () => ({ apiClient: { getCashierAnalytics: vi.fn() } }));
vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

describe('CashierAnalytics', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfig).mockReturnValue({ appName: 'Aurum POS', isDarkMode: false, toggleDarkMode: vi.fn() });
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
    vi.mocked(apiClient.getCashierAnalytics).mockImplementation(async (metal) => ({
      date: '2026-08-15',
      metal: metal as 'all' | 'gold' | 'silver' | 'platinum' | 'stone',
      total_sales: 2500,
      invoice_count: 2,
      units_sold: 3,
      average_invoice_value: 1250,
      sales_by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, total_amount: hour === 10 ? 2500 : 0 })),
      sales_by_category: metal === 'all'
        ? [
            { category: 'Gold Jewellery', sales_value: 1500, share: 60 },
            { category: 'Stones', sales_value: 1000, share: 40 },
          ]
        : [
            { category: 'Panna', sales_value: 1400, share: 56 },
            { category: 'Pokhraj', sales_value: 1100, share: 44 },
          ],
      top_selling_items: metal === 'all'
        ? [
            {
              name: 'Gold Bridal Necklace', sku: 'GOLD-NECK-01', sales_value: 1500,
              sold_amount: 1, sold_unit: 'piece',
            },
            {
              name: 'Silver Chain Lot', sku: 'SILVER-CHAIN-01', sales_value: 1000,
              sold_amount: 12.5, sold_unit: 'gram',
            },
          ]
        : [
            {
              name: 'Polished Panna Emerald', sku: 'STONE-PANNA-01', sales_value: 1400,
              sold_amount: 2, sold_unit: 'piece',
            },
          ],
    }));
  });

  it('shows only today sales metrics and applies the metal filter', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CashierAnalytics />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Today's Sales")).toBeInTheDocument();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
    expect(screen.getByText('Units Sold')).toBeInTheDocument();
    expect(screen.getByText('Average Invoice')).toBeInTheDocument();
    expect(screen.getByText('Sales overview')).toBeInTheDocument();
    expect(screen.queryByText('Sales by hour')).not.toBeInTheDocument();
    expect(screen.getByText('By category')).toBeInTheDocument();
    expect(screen.getByText('Top items by sales value')).toBeInTheDocument();
    expect(screen.getByText('Gold Bridal Necklace')).toBeInTheDocument();
    expect(screen.getByText('1 piece sold')).toBeInTheDocument();
    expect(screen.getByText('12.5 gram sold')).toBeInTheDocument();
    expect(screen.queryByText(/inventory value/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/date range/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect((await screen.findAllByText('Gold Jewellery')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stones').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Filter sales' }));
    expect(screen.getByRole('listbox', { name: 'Sales type' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'All sales' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('option', { name: 'Stones' }));
    await waitFor(() => expect(apiClient.getCashierAnalytics).toHaveBeenLastCalledWith('stone'));
    expect((await screen.findAllByText('Panna')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pokhraj').length).toBeGreaterThan(0);
    expect(screen.getByText('Polished Panna Emerald')).toBeInTheDocument();
    expect(screen.getByText('2 pieces sold')).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Sales type' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filter sales' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Sales type' })).not.toBeInTheDocument();
  });
});
