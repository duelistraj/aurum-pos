import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { Analytics } from './Analytics';
import { AnalyticsDashboardResponse } from '../types';

vi.mock('../api/client', () => ({
  apiClient: {
    getDashboardAnalytics: vi.fn(),
  },
}));
vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('@nivo/bar', () => ({
  ResponsiveBar: () => <div data-testid="nivo-bar-chart" />,
}));
vi.mock('@nivo/line', () => ({
  ResponsiveLine: () => <div data-testid="nivo-line-chart" />,
}));
vi.mock('@nivo/pie', () => ({
  ResponsivePie: () => <div data-testid="nivo-pie-chart" />,
}));

const analyticsData: AnalyticsDashboardResponse = {
  total_sales: 3200,
  total_sales_change_percentage: 12.5,
  total_sale_value: 11200,
  total_sale_value_change_percentage: 8.2,
  inventory_items: 7,
  inventory_items_change_percentage: -2.1,
  silver_rate_10g: 120.2,
  silver_rate_change_percentage: 1.4,
  total_stock_value: 8400,
  total_stock_value_change_percentage: 4.8,
  sales_overview: [
    { date: 'Jul 24', total_amount: 3200 },
  ],
  sales_by_category: [
    { category: 'Gold Jewellery', sales_value: 2200, share: 68.8 },
    { category: 'Silver Jewellery', sales_value: 1000, share: 31.2 },
  ],
  inventory_summary: {
    in_stock_count: 5,
    in_stock_percentage: 71.4,
    sold_count: 2,
    sold_percentage: 28.6,
    total_count: 7,
  },
  sales_trend: {
    current: { period: 'Jul 18 - Jul 24', sales_value: 3200 },
    previous: { period: 'Jul 11 - Jul 17', sales_value: 2844 },
  },
};

const renderAnalytics = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Analytics', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfig).mockReturnValue({
      appName: 'Aurum POS',
      isDarkMode: false,
      toggleDarkMode: vi.fn(),
    });
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: {
        shop_id: 'shop-1',
        shop_name: 'Demo Shop',
        shop_slug: 'demo',
        role: 'OWNER',
      },
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('loads the existing metrics and all insight panels using the default filter', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue(analyticsData);
    renderAnalytics();

    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect((await screen.findAllByText('₹3,200')).length).toBeGreaterThan(0);
    expect(screen.getByText('Top selling categories')).toBeInTheDocument();
    expect(screen.getByText('Inventory summary')).toBeInTheDocument();
    expect(screen.getByText('Sales trend')).toBeInTheDocument();
    expect(screen.getByTestId('nivo-line-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('nivo-pie-chart')).toHaveLength(2);
    expect(screen.getByTestId('nivo-bar-chart')).toBeInTheDocument();

    await waitFor(() => expect(apiClient.getDashboardAnalytics).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T23:59:59Z$/),
      'all',
    ));
  });

  it('updates the query when the jewellery and date filters change', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue(analyticsData);
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText('Top selling categories');
    await user.click(screen.getByRole('button', { name: 'Filter by jewellery' }));
    await user.click(screen.getByRole('option', { name: 'gold' }));
    await waitFor(() => expect(apiClient.getDashboardAnalytics).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      'gold',
    ));

    await user.click(screen.getByRole('button', { name: 'Filter by date range' }));
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));

    await waitFor(() => expect(apiClient.getDashboardAnalytics).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T23:59:59Z$/),
      'gold',
    ));
  });

  it('renders an actionable error state and retries the request', async () => {
    vi.mocked(apiClient.getDashboardAnalytics)
      .mockRejectedValueOnce(new Error('Analytics unavailable'))
      .mockResolvedValueOnce(analyticsData);
    const user = userEvent.setup();
    renderAnalytics();

    expect(await screen.findByRole('alert')).toHaveTextContent('Analytics unavailable');
    await user.click(screen.getByRole('button', { name: /Retry/ }));

    await waitFor(() => expect(apiClient.getDashboardAnalytics).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Top selling categories')).toBeInTheDocument();
  });

  it('shows empty states for charts when the response has no activity', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      sales_overview: [],
      sales_by_category: [],
      inventory_summary: {
        in_stock_count: 0,
        in_stock_percentage: 0,
        sold_count: 0,
        sold_percentage: 0,
        total_count: 0,
      },
    });
    renderAnalytics();

    expect(await screen.findByText('No sales data in this range')).toBeInTheDocument();
    expect(screen.getByText('No category sales yet')).toBeInTheDocument();
    expect(screen.getByText('No inventory yet')).toBeInTheDocument();
    expect(screen.getByText('No category data available')).toBeInTheDocument();
  });
});
