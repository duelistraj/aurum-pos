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
  bar: null as unknown,
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
vi.mock('@nivo/bar', () => ({
  ResponsiveBar: (props: unknown) => {
    nivoProps.bar = props;
    return <div data-testid="nivo-bar-chart" />;
  },
}));
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
    nivoProps.bar = null;
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
    const barProps = nivoProps.bar as {
      axisBottom: { tickValues: number };
      margin: { right: number };
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
    expect(barProps.axisBottom.tickValues).toBe(5);
    expect(barProps.margin.right).toBeGreaterThanOrEqual(72);
    expect(inventoryPieProps).toMatchObject({
      innerRadius: categoryPieProps.innerRadius,
      padAngle: categoryPieProps.padAngle,
      cornerRadius: categoryPieProps.cornerRadius,
      borderWidth: categoryPieProps.borderWidth,
      borderColor: categoryPieProps.borderColor,
    });
    expect(inventoryPieProps.layers).toHaveLength(2);
  });

  it('shares distinct category colors between the breakdown donut and top-category bars', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      sales_by_category: [
        { category: 'Anklet', sales_value: 2_100, share: 65.6 },
        { category: 'Jewellery', sales_value: 1_100, share: 34.4 },
      ],
    });
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText('Top selling categories');
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
    const barProps = nivoProps.bar as {
      colors: (bar: { data: { category: string } }) => string;
    };
    const ankletColor = categoryPieProps.colors({ id: 'Anklet' });
    const jewelleryColor = categoryPieProps.colors({ id: 'Jewellery' });

    expect(ankletColor).not.toBe(jewelleryColor);
    expect(barProps.colors({ data: { category: 'Anklet' } })).toBe(ankletColor);
    expect(barProps.colors({ data: { category: 'Jewellery' } })).toBe(jewelleryColor);
  });

  it('shows N/A when the specifically selected metal has no configured rate', async () => {
    vi.mocked(apiClient.getDashboardAnalytics).mockResolvedValue({
      ...analyticsData,
      metal_rates: [{ metal: 'gold', rate_per_10g: 72_000, change_percentage: 2.1 }],
    });
    const user = userEvent.setup();
    renderAnalytics();

    await screen.findByText('Top selling categories');
    await user.click(screen.getByRole('button', { name: 'Filter by jewellery' }));
    await user.click(screen.getByRole('option', { name: 'Platinum' }));

    expect(await screen.findByText('N/A')).toBeInTheDocument();
    expect(screen.getByText('Rate not set')).toBeInTheDocument();
  });
});
