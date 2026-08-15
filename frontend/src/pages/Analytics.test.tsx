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

const nivoProps = vi.hoisted(() => ({
  line: null as unknown,
  pies: [] as unknown[],
}));

vi.mock('../api/client', () => ({
  apiClient: {
    getDashboardAnalytics: vi.fn(),
  },
}));
vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('@nivo/line', () => ({
  ResponsiveLine: (props: unknown) => {
    nivoProps.line = props;
    return <div data-testid="nivo-line-chart" />;
  },
}));
vi.mock('@nivo/pie', () => ({
  ResponsivePie: (props: unknown) => {
    nivoProps.pies.push(props);
    return <div data-testid="nivo-pie-chart" />;
  },
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
  metal_rates: [
    { metal: 'gold', rate_per_10g: 72000, change_percentage: 2.1 },
    { metal: 'silver', rate_per_10g: 120.2, change_percentage: 1.4 },
    { metal: 'platinum', rate_per_10g: 38000, change_percentage: -0.5 },
  ],
  total_stock_value: 8400,
  total_stock_value_change_percentage: 4.8,
  sales_overview: [
    { date: 'Jul 24', total_amount: 3200 },
  ],
  sales_by_category: [
    { category: 'Gold Jewellery', sales_value: 2200, share: 68.8 },
    { category: 'Silver Jewellery', sales_value: 1000, share: 31.2 },
  ],
  top_selling_items: [
    {
      name: 'Gold Bridal Necklace', sku: 'GOLD-NECK-01', sales_value: 2200,
      sold_amount: 1, sold_unit: 'piece',
    },
    {
      name: 'Silver Chain Lot', sku: 'SILVER-CHAIN-01', sales_value: 1000,
      sold_amount: 12.5, sold_unit: 'gram',
    },
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
    nivoProps.line = null;
    nivoProps.pies = [];
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

  it('loads the existing metrics and all insight panels using the default filter', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue(analyticsData);
    renderAnalytics();

    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    expect((await screen.findAllByText('₹3,200')).length).toBeGreaterThan(0);
    expect(screen.getByText('Top items by sales value')).toBeInTheDocument();
    expect(screen.getByText('Gold Bridal Necklace')).toBeInTheDocument();
    expect(screen.getByText('1 piece sold')).toBeInTheDocument();
    expect(screen.getByText('12.5 gram sold')).toBeInTheDocument();
    expect(screen.getByText('Inventory summary')).toBeInTheDocument();
    expect(screen.getByText('Sales trend')).toBeInTheDocument();
    expect(screen.queryByText(/rate \(per 10g\)/i)).not.toBeInTheDocument();
    expect(document.querySelectorAll('.analytics-kpi')).toHaveLength(4);
    expect(screen.getByTestId('nivo-line-chart')).toBeInTheDocument();
    expect(screen.getAllByTestId('nivo-pie-chart')).toHaveLength(2);

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

    await screen.findByText('Top items by sales value');
    await user.click(screen.getByRole('button', { name: 'Filter by jewellery' }));
    await user.click(screen.getByRole('option', { name: 'Gold' }));
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

  it('supports a dedicated stones analytics filter without a market-rate card', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      metal_rates: [],
    });
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText('Top items by sales value');
    await user.click(screen.getByRole('button', { name: 'Filter by jewellery' }));
    await user.click(screen.getByRole('option', { name: 'Stones' }));

    await waitFor(() => expect(apiClient.getDashboardAnalytics).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      'stone',
    ));
    expect(screen.queryByText(/rate per 10g/i)).not.toBeInTheDocument();
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
    expect(await screen.findByText('Top items by sales value')).toBeInTheDocument();
  });

  it('shows empty states for charts when the response has no activity', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      sales_overview: [],
      sales_by_category: [],
      top_selling_items: [],
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
    expect(screen.getByText('No item sales in this range')).toBeInTheDocument();
  });

  it('constrains chart ticks, reserves value-label space, and preserves tiny inventory slices', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      sales_overview: Array.from({ length: 30 }, (_, index) => ({
        date: `Jul ${String(index + 1).padStart(2, '0')}`,
        total_amount: index * 1_000,
      })),
      inventory_summary: {
        in_stock_count: 1407,
        in_stock_percentage: 99.8,
        sold_count: 3,
        sold_percentage: 0.2,
        total_count: 1410,
      },
    });
    renderAnalytics();

    await screen.findByTestId('nivo-line-chart');
    const lineProps = nivoProps.line as {
      axisBottom: { tickValues: string[] };
      axisLeft: { tickValues: number };
    };
    const inventoryPieProps = nivoProps.pies[nivoProps.pies.length - 1] as {
      innerRadius: number;
      padAngle: number;
      cornerRadius: number;
      borderWidth: number;
      borderColor: string;
      layers: unknown[];
    };
    const categoryPieProps = nivoProps.pies[0] as {
      innerRadius: number;
      padAngle: number;
      cornerRadius: number;
      borderWidth: number;
      borderColor: string;
    };

    expect(lineProps.axisBottom.tickValues).toHaveLength(6);
    expect(lineProps.axisBottom.tickValues[0]).toBe('Jul 01');
    expect(lineProps.axisBottom.tickValues[lineProps.axisBottom.tickValues.length - 1]).toBe('Jul 30');
    expect(lineProps.axisLeft.tickValues).toBe(5);
    expect(inventoryPieProps).toMatchObject({
      innerRadius: categoryPieProps.innerRadius,
      padAngle: categoryPieProps.padAngle,
      cornerRadius: categoryPieProps.cornerRadius,
      borderWidth: categoryPieProps.borderWidth,
      borderColor: categoryPieProps.borderColor,
    });
    expect(inventoryPieProps.layers).toHaveLength(2);
  });

  it('keeps distinct category colors in the sales breakdown after removing the duplicate ranking', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      sales_by_category: [
        { category: 'Anklet', sales_value: 2_100, share: 65.6 },
        { category: 'Jewellery', sales_value: 1_100, share: 34.4 },
      ],
    });
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText('Top items by sales value');
    await user.click(screen.getByRole('button', { name: 'Filter by jewellery' }));
    await user.click(screen.getByRole('option', { name: 'Silver' }));
    await waitFor(() => expect(apiClient.getDashboardAnalytics).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      'silver',
    ));

    const categoryPieProps = nivoProps.pies[nivoProps.pies.length - 2] as {
      colors: (datum: { id: string }) => string;
    };
    const ankletColor = categoryPieProps.colors({ id: 'Anklet' });
    const jewelleryColor = categoryPieProps.colors({ id: 'Jewellery' });

    expect(ankletColor).not.toBe(jewelleryColor);
  });

});
