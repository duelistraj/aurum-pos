import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Coins,
  IndianRupee,
  Package,
  PieChart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  ArcElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  TooltipItem,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { AnalyticsDashboardResponse } from '../types';
import { formatCurrency } from '../utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
);

type PresetId = '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom range' },
];

const JEWELLERY_OPTIONS = ['all', 'gold', 'silver', 'platinum'] as const;
const CATEGORY_COLORS = ['#C27D18', '#6386AA', '#6D8F74', '#A179A6', '#C28A4A', '#8C7772', '#75849A', '#A86762'];

const CHART_THEME = {
  light: {
    grid: '#E9E5DC',
    label: '#7B8790',
    tooltipBackground: '#182027',
    tooltipBorder: '#2D3942',
    line: '#B8791F',
    fill: 'rgba(184, 121, 31, 0.12)',
    point: '#B8791F',
    pointBorder: '#FFFEFA',
    stock: '#6D8F74',
    sold: '#6386AA',
  },
  dark: {
    grid: '#34383B',
    label: '#A5ADB1',
    tooltipBackground: '#F7F2E9',
    tooltipBorder: '#E1D6C4',
    line: '#E0A14B',
    fill: 'rgba(224, 161, 75, 0.16)',
    point: '#E0A14B',
    pointBorder: '#1A1D20',
    stock: '#86B794',
    sold: '#82A8D1',
  },
} as const;

const formatDateStr = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPresetDates = (presetId: Exclude<PresetId, 'custom'>, now = new Date()) => {
  let start = new Date(now);
  let end = new Date(now);

  switch (presetId) {
    case '7d':
      start.setDate(now.getDate() - 6);
      break;
    case '30d':
      start.setDate(now.getDate() - 29);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
  }

  return {
    startDate: formatDateStr(start),
    endDate: formatDateStr(end),
  };
};

const getRangeLabel = (startDate: string, endDate: string): string => {
  if (!startDate || !endDate) return 'Select date range';
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
};

const formatCompactValue = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
};

const formatPercentage = (value: number): string => `${Math.abs(value).toFixed(1)}%`;

interface EmptyStateProps {
  message: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ message }) => (
  <div className="analytics-empty-state">
    <Activity className="analytics-empty-state__icon" />
    <span>{message}</span>
  </div>
);

interface ChangeIndicatorProps {
  value: number;
}

const ChangeIndicator: React.FC<ChangeIndicatorProps> = ({ value }) => {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`analytics-change analytics-change--${positive ? 'positive' : 'negative'}`}>
      <Icon className="analytics-change__icon" />
      {formatPercentage(value)}
      <span className="analytics-change__caption">vs previous period</span>
    </span>
  );
};

interface AnalyticsKpiProps {
  label: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  tone: 'gold' | 'blue' | 'violet' | 'green' | 'slate';
}

const AnalyticsKpi: React.FC<AnalyticsKpiProps> = ({ label, value, change, icon, tone }) => (
  <article className={`analytics-kpi analytics-kpi--${tone}`}>
    <div className="analytics-kpi__topline">
      <p className="analytics-kpi__label">{label}</p>
      <span className="analytics-kpi__icon" aria-hidden="true">{icon}</span>
    </div>
    <p className="analytics-kpi__value">{value}</p>
    <ChangeIndicator value={change} />
  </article>
);

interface PanelHeaderProps {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  tone?: 'gold' | 'blue' | 'green' | 'violet';
  children?: React.ReactNode;
}

const PanelHeader: React.FC<PanelHeaderProps> = ({ eyebrow, title, icon, tone = 'gold', children }) => (
  <div className="analytics-panel__header">
    <div className="analytics-panel__heading-group">
      <p className={`analytics-panel__eyebrow analytics-panel__eyebrow--${tone}`}>
        <span className="analytics-panel__eyebrow-icon">{icon}</span>
        {eyebrow}
      </p>
      <h2 className="analytics-panel__title">{title}</h2>
    </div>
    {children}
  </div>
);

export const Analytics: React.FC = () => {
  const { isDarkMode } = useConfig();
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const [activePreset, setActivePreset] = useState<PresetId>('7d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedJewellery, setSelectedJewellery] = useState<string>('all');
  const [openFilter, setOpenFilter] = useState<'date' | 'jewellery' | null>(null);
  const filterAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialRange = getPresetDates('7d');
    setStartDate(initialRange.startDate);
    setEndDate(initialRange.endDate);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!filterAreaRef.current?.contains(event.target as Node)) setOpenFilter(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFilter(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isoStart = startDate ? `${startDate}T00:00:00Z` : '';
  const isoEnd = endDate ? `${endDate}T23:59:59Z` : '';
  const hasRequest = Boolean(shopId && isoStart && isoEnd);
  const analyticsQuery = useQuery<AnalyticsDashboardResponse>({
    queryKey: queryKeys.analytics(shopId, isoStart, isoEnd, selectedJewellery),
    queryFn: () => apiClient.getDashboardAnalytics(isoStart, isoEnd, selectedJewellery),
    enabled: hasRequest,
  });
  const data = analyticsQuery.data ?? null;
  const loading = hasRequest && analyticsQuery.isPending && !data;
  const error = analyticsQuery.error instanceof Error ? analyticsQuery.error.message : null;
  const chartTheme = isDarkMode ? CHART_THEME.dark : CHART_THEME.light;

  const applyPreset = (presetId: PresetId) => {
    if (presetId === 'custom') {
      setActivePreset('custom');
      setOpenFilter('date');
      return;
    }
    const range = getPresetDates(presetId);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setActivePreset(presetId);
    setOpenFilter(null);
  };

  const lineChartData = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.sales_overview.map((point) => point.date),
      datasets: [{
        label: 'Sales',
        data: data.sales_overview.map((point) => point.total_amount),
        fill: true,
        backgroundColor: chartTheme.fill,
        borderColor: chartTheme.line,
        borderWidth: 2.5,
        pointBackgroundColor: chartTheme.point,
        pointBorderColor: chartTheme.pointBorder,
        pointBorderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        tension: 0.35,
      }],
    };
  }, [chartTheme.fill, chartTheme.line, chartTheme.point, chartTheme.pointBorder, data]);

  const lineChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' as const },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: chartTheme.tooltipBackground,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        titleColor: isDarkMode ? '#1A1D20' : '#FFFDF8',
        bodyColor: isDarkMode ? '#1A1D20' : '#FFFDF8',
        titleFont: { size: 11, weight: 'bold' as const },
        bodyFont: { size: 11, weight: 'bold' as const },
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context: TooltipItem<'line'>) => formatCurrency(Number(context.raw)),
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: {
          color: chartTheme.label,
          maxRotation: 0,
          font: { size: 10, weight: 'bold' as const },
        },
      },
      y: {
        border: { display: false },
        grid: { color: chartTheme.grid },
        ticks: {
          color: chartTheme.label,
          font: { size: 10, weight: 'bold' as const },
          callback: (value: string | number) => formatCompactValue(Number(value)),
        },
      },
    },
  }), [chartTheme.grid, chartTheme.label, chartTheme.tooltipBackground, chartTheme.tooltipBorder, isDarkMode]);

  const categoryHasData = Boolean(data?.sales_by_category.some((category) => category.sales_value > 0));
  const categoryChartData = useMemo(() => {
    if (!data || !categoryHasData) return null;
    return {
      labels: data.sales_by_category.map((category) => category.category),
      datasets: [{
        data: data.sales_by_category.map((category) => category.sales_value),
        backgroundColor: CATEGORY_COLORS,
        borderColor: isDarkMode ? '#1A1D20' : '#FFFEFA',
        borderWidth: 3,
        hoverOffset: 5,
      }],
    };
  }, [categoryHasData, data, isDarkMode]);

  const categoryChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '76%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: chartTheme.tooltipBackground,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        titleColor: isDarkMode ? '#1A1D20' : '#FFFDF8',
        bodyColor: isDarkMode ? '#1A1D20' : '#FFFDF8',
        padding: 10,
        callbacks: {
          label: (context: TooltipItem<'doughnut'>) => {
            const value = Number(context.raw);
            const total = context.dataset.data.reduce((sum, item) => sum + Number(item), 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return ` ${context.label}: ${formatCurrency(value)} (${percentage}%)`;
          },
        },
      },
    },
  }), [chartTheme.tooltipBackground, chartTheme.tooltipBorder, isDarkMode]);

  const inventoryHasData = Boolean(data && data.inventory_summary.total_count > 0);
  const inventoryChartData = useMemo(() => {
    if (!data || !inventoryHasData) return null;
    return {
      labels: ['In stock', 'Sold'],
      datasets: [{
        data: [data.inventory_summary.in_stock_count, data.inventory_summary.sold_count],
        backgroundColor: [chartTheme.stock, chartTheme.sold],
        borderColor: isDarkMode ? '#1A1D20' : '#FFFEFA',
        borderWidth: 3,
      }],
    };
  }, [chartTheme.sold, chartTheme.stock, data, inventoryHasData, isDarkMode]);

  const inventoryChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '76%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: chartTheme.tooltipBackground,
        borderColor: chartTheme.tooltipBorder,
        borderWidth: 1,
        titleColor: isDarkMode ? '#1A1D20' : '#FFFDF8',
        bodyColor: isDarkMode ? '#1A1D20' : '#FFFDF8',
        padding: 10,
        callbacks: {
          label: (context: TooltipItem<'doughnut'>) => {
            const value = Number(context.raw);
            const total = context.dataset.data.reduce((sum, item) => sum + Number(item), 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return ` ${context.label}: ${value} (${percentage}%)`;
          },
        },
      },
    },
  }), [chartTheme.tooltipBackground, chartTheme.tooltipBorder, isDarkMode]);

  const totalSalesTrend = data?.total_sales_change_percentage ?? 0;
  const previousSales = data?.sales_trend.previous.sales_value ?? 0;
  const currentSales = data?.sales_trend.current.sales_value ?? 0;
  const maximumSales = Math.max(previousSales, currentSales, 100);
  const previousSalesWidth = `${(previousSales / maximumSales) * 100}%`;
  const currentSalesWidth = `${(currentSales / maximumSales) * 100}%`;

  return (
    <section className="analytics-page">
      <div className="analytics-page__header">
        <div>
          <p className="dashboard-eyebrow">Performance overview</p>
          <h1 className="analytics-page__title">Analytics</h1>
          <p className="analytics-page__subtitle">Understand your sales, inventory, and shop performance.</p>
        </div>

        <div ref={filterAreaRef} className="analytics-filters" aria-label="Analytics filters">
          <div className="analytics-filter-wrap">
            <button
              type="button"
              className={`analytics-filter-button${openFilter === 'jewellery' ? ' is-open' : ''}`}
              onClick={() => setOpenFilter((current) => current === 'jewellery' ? null : 'jewellery')}
              aria-label="Filter by jewellery"
              aria-haspopup="listbox"
              aria-expanded={openFilter === 'jewellery'}
            >
              <Coins className="analytics-filter-button__icon" />
              <span>{selectedJewellery === 'all' ? 'All jewellery' : selectedJewellery}</span>
              <ChevronDown className={`analytics-filter-button__chevron${openFilter === 'jewellery' ? ' is-open' : ''}`} />
            </button>
            {openFilter === 'jewellery' ? (
              <div className="analytics-filter-menu" role="listbox" aria-label="Jewellery type">
                {JEWELLERY_OPTIONS.map((option) => {
                  const selected = selectedJewellery === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`analytics-filter-option${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedJewellery(option);
                        setOpenFilter(null);
                      }}
                    >
                      <span>{option === 'all' ? 'All jewellery' : option}</span>
                      {selected ? <Check className="analytics-filter-option__check" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="analytics-filter-wrap">
            <button
              type="button"
              className={`analytics-filter-button${openFilter === 'date' ? ' is-open' : ''}`}
              onClick={() => setOpenFilter((current) => current === 'date' ? null : 'date')}
              aria-label="Filter by date range"
              aria-haspopup="dialog"
              aria-expanded={openFilter === 'date'}
            >
              <Calendar className="analytics-filter-button__icon" />
              <span>{getRangeLabel(startDate, endDate)}</span>
              <ChevronDown className={`analytics-filter-button__chevron${openFilter === 'date' ? ' is-open' : ''}`} />
            </button>
            {openFilter === 'date' ? (
              <div className="analytics-filter-menu analytics-filter-menu--date" role="dialog" aria-label="Date range">
                <p className="analytics-filter-menu__title">Date range</p>
                <div className="analytics-filter-presets">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`analytics-filter-option${activePreset === preset.id ? ' is-selected' : ''}`}
                      onClick={() => applyPreset(preset.id)}
                    >
                      <span>{preset.label}</span>
                      {activePreset === preset.id ? <Check className="analytics-filter-option__check" /> : null}
                    </button>
                  ))}
                </div>
                {activePreset === 'custom' ? (
                  <div className="analytics-custom-range">
                    <label className="analytics-date-field">
                      <span>Start date</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </label>
                    <label className="analytics-date-field">
                      <span>End date</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                      />
                    </label>
                    <button type="button" className="analytics-custom-range__apply" onClick={() => setOpenFilter(null)}>
                      Apply range
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="analytics-alert" role="alert">
          <div className="analytics-alert__copy">
            <AlertCircle className="analytics-alert__icon" />
            <div>
              <p className="analytics-alert__title">Analytics data could not be loaded</p>
              <p className="analytics-alert__message">{error}</p>
            </div>
          </div>
          <button
            type="button"
            className="analytics-alert__retry"
            onClick={() => void analyticsQuery.refetch()}
            disabled={analyticsQuery.isFetching}
          >
            <RefreshCw className={`analytics-alert__retry-icon${analyticsQuery.isFetching ? ' is-spinning' : ''}`} />
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="analytics-loading" role="status" aria-label="Loading analytics">
          <span className="analytics-loading__bar" />
          <span className="analytics-loading__bar" />
          <span className="analytics-loading__bar analytics-loading__bar--wide" />
        </div>
      ) : data ? (
        <div className="analytics-content">
          <div className="analytics-kpis" aria-label="Analytics metrics">
            <AnalyticsKpi
              label="Total sales"
              value={formatCurrency(data.total_sales)}
              change={data.total_sales_change_percentage}
              tone="gold"
              icon={<IndianRupee className="analytics-kpi__svg" />}
            />
            <AnalyticsKpi
              label="Catalog value"
              value={formatCurrency(data.total_sale_value)}
              change={data.total_sale_value_change_percentage}
              tone="blue"
              icon={<ArrowUpRight className="analytics-kpi__svg" />}
            />
            <AnalyticsKpi
              label="Inventory items"
              value={String(data.inventory_items)}
              change={data.inventory_items_change_percentage}
              tone="violet"
              icon={<Package className="analytics-kpi__svg" />}
            />
            <AnalyticsKpi
              label="Silver rate"
              value={formatCurrency(data.silver_rate_10g)}
              change={data.silver_rate_change_percentage}
              tone="green"
              icon={<Coins className="analytics-kpi__svg" />}
            />
            <AnalyticsKpi
              label="Stock value"
              value={formatCurrency(data.total_stock_value)}
              change={data.total_stock_value_change_percentage}
              tone="slate"
              icon={<PieChart className="analytics-kpi__svg" />}
            />
          </div>

          <div className="analytics-grid analytics-grid--primary">
            <article className="analytics-panel analytics-panel--sales">
              <PanelHeader eyebrow="Sales overview" title={formatCurrency(data.total_sales)} icon={<Activity className="analytics-panel__icon" />} tone="green">
                <ChangeIndicator value={data.total_sales_change_percentage} />
              </PanelHeader>
              <div className="analytics-chart analytics-chart--line">
                {data.sales_overview.length > 0 && lineChartData ? (
                  <Line data={lineChartData} options={lineChartOptions} />
                ) : (
                  <EmptyState message="No sales data in this range" />
                )}
              </div>
            </article>

            <article className="analytics-panel analytics-panel--category">
              <PanelHeader eyebrow="Sales breakdown" title="By category" icon={<PieChart className="analytics-panel__icon" />} tone="violet" />
              <div className="analytics-category-layout">
                <div className="analytics-chart analytics-chart--donut">
                  {categoryChartData ? <Doughnut data={categoryChartData} options={categoryChartOptions} /> : <EmptyState message="No category sales yet" />}
                  {categoryChartData ? (
                    <div className="analytics-chart__center-label">
                      <strong>{formatCurrency(data.total_sales)}</strong>
                      <span>Total sales</span>
                    </div>
                  ) : null}
                </div>
                <div className="analytics-legend" aria-label="Sales category breakdown">
                  {data.sales_by_category.length > 0 ? data.sales_by_category.map((category, index) => (
                    <div key={category.category} className="analytics-legend__row">
                      <span className="analytics-legend__label">
                        <span className="analytics-legend__swatch" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} />
                        <span title={category.category}>{category.category}</span>
                      </span>
                      <strong>{category.share}%</strong>
                    </div>
                  )) : <span className="analytics-legend__empty">No category data</span>}
                </div>
              </div>
            </article>
          </div>

          <div className="analytics-grid analytics-grid--supporting">
            <article className="analytics-panel analytics-panel--supporting">
              <PanelHeader eyebrow="Merchandising" title="Top selling categories" icon={<TrendingUp className="analytics-panel__icon" />} />
              <div className="analytics-category-list">
                {data.sales_by_category.length > 0 ? data.sales_by_category.slice(0, 3).map((category) => (
                  <div key={category.category} className="analytics-category-list__row">
                    <div>
                      <p>{category.category}</p>
                      <span>{category.share}% of sales</span>
                    </div>
                    <strong>{formatCurrency(category.sales_value)}</strong>
                  </div>
                )) : <EmptyState message="No category data available" />}
              </div>
            </article>

            <article className="analytics-panel analytics-panel--supporting">
              <PanelHeader eyebrow="Inventory mix" title="Inventory summary" icon={<Package className="analytics-panel__icon" />} tone="violet" />
              <div className="analytics-inventory-layout">
                <div className="analytics-chart analytics-chart--inventory">
                  {inventoryChartData ? <Doughnut data={inventoryChartData} options={inventoryChartOptions} /> : <EmptyState message="No inventory yet" />}
                  {inventoryChartData ? (
                    <div className="analytics-chart__center-label">
                      <strong>{data.inventory_summary.total_count}</strong>
                      <span>Total items</span>
                    </div>
                  ) : null}
                </div>
                <div className="analytics-inventory-legend">
                  <div>
                    <span><i className="analytics-inventory-legend__dot analytics-inventory-legend__dot--stock" />In stock</span>
                    <strong>{data.inventory_summary.in_stock_count} <small>({data.inventory_summary.in_stock_percentage}%)</small></strong>
                  </div>
                  <div>
                    <span><i className="analytics-inventory-legend__dot analytics-inventory-legend__dot--sold" />Sold</span>
                    <strong>{data.inventory_summary.sold_count} <small>({data.inventory_summary.sold_percentage}%)</small></strong>
                  </div>
                </div>
              </div>
            </article>

            <article className="analytics-panel analytics-panel--supporting">
              <PanelHeader eyebrow="Period comparison" title="Sales trend" icon={<Activity className="analytics-panel__icon" />} tone="green" />
              <div className="analytics-trend">
                <div className={`analytics-trend__headline analytics-trend__headline--${totalSalesTrend >= 0 ? 'positive' : 'negative'}`}>
                  {totalSalesTrend >= 0 ? <ArrowUpRight className="analytics-trend__headline-icon" /> : <ArrowDownRight className="analytics-trend__headline-icon" />}
                  <strong>{totalSalesTrend >= 0 ? '+' : '-'}{formatPercentage(totalSalesTrend)}</strong>
                </div>
                <p className="analytics-trend__caption">{totalSalesTrend >= 0 ? 'Increase' : 'Decrease'} in total sales</p>
                <div className="analytics-trend__bars">
                  <div className="analytics-trend__bar-group">
                    <div className="analytics-trend__bar-label"><span>{data.sales_trend.previous.period}</span><strong>{formatCurrency(previousSales)}</strong></div>
                    <div className="analytics-trend__track"><span className="analytics-trend__bar analytics-trend__bar--previous" style={{ width: previousSalesWidth }} /></div>
                  </div>
                  <div className="analytics-trend__bar-group">
                    <div className="analytics-trend__bar-label"><span>{data.sales_trend.current.period}</span><strong>{formatCurrency(currentSales)}</strong></div>
                    <div className="analytics-trend__track"><span className="analytics-trend__bar analytics-trend__bar--current" style={{ width: currentSalesWidth }} /></div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      ) : (
        <div className="analytics-no-data">
          <BarChart3 className="analytics-no-data__icon" />
          <p>No analytics data loaded.</p>
          <span>Choose a shop and date range to view performance insights.</span>
        </div>
      )}
    </section>
  );
};
