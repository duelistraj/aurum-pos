import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveLine } from '@nivo/line';
import { PieCustomLayerProps, ResponsivePie } from '@nivo/pie';
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
  Info,
  Package,
  PieChart,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import {
  ANALYTICS_CHART_TYPOGRAPHY,
  createBreakdownColorMap,
  formatCompactCurrency,
  getChartColor,
  selectEvenlySpacedTicks,
} from '../features/analytics/chartConfig';
import { TopSellingItems } from '../features/analytics/TopSellingItems';
import { AnalyticsDashboardResponse } from '../types';
import { formatWholeCurrency } from '../utils';

type PresetId = '7d' | '30d' | 'this_month' | 'last_month' | 'custom';

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'custom', label: 'Custom range' },
];

const JEWELLERY_OPTIONS = [
  { value: 'all', label: 'All inventory' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'stone', label: 'Stones' },
] as const;

const CHART_THEME = {
  light: {
    grid: '#E9E5DC',
    label: '#63717D',
    tooltipBackground: '#182027',
    tooltipBorder: '#2D3942',
    tooltipText: '#FFFDF8',
    line: '#3E9161',
    point: '#3E9161',
    pointBorder: '#FFFEFA',
    chartBorder: '#FFFEFA',
  },
  dark: {
    grid: '#34383B',
    label: '#A5ADB1',
    tooltipBackground: '#F7F2E9',
    tooltipBorder: '#E1D6C4',
    tooltipText: '#1A1D20',
    line: '#83C59A',
    point: '#83C59A',
    pointBorder: '#1A1D20',
    chartBorder: '#1A1D20',
  },
} as const;

type ChartTheme = (typeof CHART_THEME)[keyof typeof CHART_THEME];
type AnalyticsLineSeries = {
  id: string;
  data: Array<{ x: string; y: number }>;
};
type AnalyticsPieDatum = {
  id: string;
  value: number;
};
const createNivoTheme = (theme: ChartTheme) => ({
  background: 'transparent',
  text: {
    fill: theme.label,
    fontSize: ANALYTICS_CHART_TYPOGRAPHY.supportingSize,
    fontWeight: ANALYTICS_CHART_TYPOGRAPHY.regularWeight,
  },
  axis: {
    domain: {
      line: { stroke: 'transparent' },
    },
    ticks: {
      line: { stroke: 'transparent' },
      text: {
        fill: theme.label,
        fontSize: ANALYTICS_CHART_TYPOGRAPHY.supportingSize,
        fontWeight: ANALYTICS_CHART_TYPOGRAPHY.regularWeight,
      },
    },
  },
  grid: {
    line: {
      stroke: theme.grid,
      strokeWidth: 1,
    },
  },
  tooltip: {
    container: {
      background: theme.tooltipBackground,
      color: theme.tooltipText,
      border: `1px solid ${theme.tooltipBorder}`,
      borderRadius: '.45rem',
      boxShadow: 'none',
      fontSize: '.75rem',
      fontWeight: ANALYTICS_CHART_TYPOGRAPHY.regularWeight,
      padding: '.6rem .7rem',
    },
  },
});

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
  change?: number;
  context?: string;
  icon: React.ReactNode;
  tone: 'gold' | 'blue' | 'violet' | 'green' | 'slate';
}

const AnalyticsKpi: React.FC<AnalyticsKpiProps> = ({ label, value, change, context, icon, tone }) => (
  <article className={`analytics-kpi analytics-kpi--${tone}`}>
    <div className="analytics-kpi__topline">
      <p className="analytics-kpi__label">{label}</p>
      <span className="analytics-kpi__icon" aria-hidden="true">{icon}</span>
    </div>
    <p className="analytics-kpi__value">{value}</p>
    {change === undefined ? (
      <span className="analytics-kpi__context">{context}</span>
    ) : <ChangeIndicator value={change} />}
  </article>
);

const TinyInventorySliceMarkers: React.FC<PieCustomLayerProps<AnalyticsPieDatum>> = ({
  dataWithArc,
  centerX,
  centerY,
}) => (
  <g aria-hidden="true">
    {dataWithArc.filter(({ value, arc }) => value > 0 && arc.angleDeg < 2).map((datum) => {
      const angle = (datum.arc.startAngle + datum.arc.endAngle) / 2;
      const innerRadius = datum.arc.innerRadius + 1;
      const outerRadius = datum.arc.outerRadius - 1;
      return (
        <line
          key={datum.id}
          x1={centerX + Math.sin(angle) * innerRadius}
          y1={centerY - Math.cos(angle) * innerRadius}
          x2={centerX + Math.sin(angle) * outerRadius}
          y2={centerY - Math.cos(angle) * outerRadius}
          stroke={datum.color}
          strokeWidth={2}
        />
      );
    })}
  </g>
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
  const colorMode = isDarkMode ? 'dark' : 'light';
  const nivoTheme = useMemo(() => createNivoTheme(chartTheme), [chartTheme]);

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

  const categoryHasData = Boolean(data?.sales_by_category.some((category) => category.sales_value > 0));
  const inventoryHasData = Boolean(data && data.inventory_summary.total_count > 0);
  const lineChartData = useMemo<AnalyticsLineSeries[]>(() => data ? [{
    id: 'Sales',
    data: data.sales_overview.map((point) => ({ x: point.date, y: point.total_amount })),
  }] : [], [data]);
  const categoryChartData = useMemo<AnalyticsPieDatum[]>(() => data && categoryHasData ? data.sales_by_category.map((category) => ({
    id: category.category,
    value: category.sales_value,
  })) : [], [categoryHasData, data]);
  const inventoryChartData = useMemo<AnalyticsPieDatum[]>(() => data && inventoryHasData ? [
    { id: 'In stock', value: data.inventory_summary.in_stock_count },
    { id: 'Sold', value: data.inventory_summary.sold_count },
  ] : [], [data, inventoryHasData]);
  const lineTickValues = useMemo(() => selectEvenlySpacedTicks(
    lineChartData[0]?.data.map(({ x }) => x) ?? [],
    6,
  ), [lineChartData]);
  const categoryTotal = categoryChartData.reduce((sum, category) => sum + category.value, 0);
  const inventoryTotal = inventoryChartData.reduce((sum, category) => sum + category.value, 0);
  const selectedJewelleryLabel = JEWELLERY_OPTIONS.find(
    ({ value }) => value === selectedJewellery,
  )?.label ?? 'All inventory';
  const useMetalBreakdownColors = selectedJewellery === 'all';
  const breakdownColorByLabel = useMemo(() => createBreakdownColorMap(
    categoryChartData.map(({ id }) => id),
    {
      useMetalColors: useMetalBreakdownColors,
      mode: colorMode,
    },
  ), [categoryChartData, colorMode, useMetalBreakdownColors]);
  const breakdownColor = (label: string) => (
    breakdownColorByLabel.get(label) ?? getChartColor(0, colorMode)
  );
  const inventoryColorByLabel = useMemo(() => createBreakdownColorMap(
    inventoryChartData.map(({ id }) => id),
    { useMetalColors: false, mode: colorMode },
  ), [colorMode, inventoryChartData]);
  const inventoryColor = (label: string) => (
    inventoryColorByLabel.get(label) ?? getChartColor(0, colorMode)
  );
  const previousTrendColor = getChartColor(0, colorMode);
  const currentTrendColor = getChartColor(1, colorMode);

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
              <span>{selectedJewelleryLabel}</span>
              <ChevronDown className={`analytics-filter-button__chevron${openFilter === 'jewellery' ? ' is-open' : ''}`} />
            </button>
            {openFilter === 'jewellery' ? (
              <div className="analytics-filter-menu" role="listbox" aria-label="Jewellery type">
                {JEWELLERY_OPTIONS.map((option) => {
                  const selected = selectedJewellery === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`analytics-filter-option${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        setSelectedJewellery(option.value);
                        setOpenFilter(null);
                      }}
                    >
                      <span>{option.label}</span>
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
              value={formatWholeCurrency(data.total_sales)}
              change={data.total_sales_change_percentage}
              tone="gold"
              icon={<IndianRupee className="analytics-kpi__svg" />}
            />
            <AnalyticsKpi
              label="Catalog value"
              value={formatWholeCurrency(data.total_sale_value)}
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
              label="Stock value"
              value={formatWholeCurrency(data.total_stock_value)}
              change={data.total_stock_value_change_percentage}
              tone="slate"
              icon={<PieChart className="analytics-kpi__svg" />}
            />
          </div>

          <div className="analytics-grid analytics-grid--primary">
            <article className="analytics-panel analytics-panel--sales">
              <PanelHeader eyebrow="Sales overview" title={formatWholeCurrency(data.total_sales)} icon={<Activity className="analytics-panel__icon" />} tone="green">
                <ChangeIndicator value={data.total_sales_change_percentage} />
              </PanelHeader>
              <div className="analytics-chart analytics-chart--line">
                {lineChartData[0]?.data.length ? (
                  <ResponsiveLine
                    data={lineChartData}
                    margin={{ top: 8, right: 32, bottom: 36, left: 56 }}
                    xScale={{ type: 'point' }}
                    yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
                    curve="monotoneX"
                    colors={[chartTheme.line]}
                    theme={nivoTheme}
                    enableGridX={false}
                    enableGridY
                    axisBottom={{ tickValues: lineTickValues, tickSize: 0, tickPadding: 10, tickRotation: 0 }}
                    axisLeft={{ tickValues: 5, tickSize: 0, tickPadding: 8, tickRotation: 0, format: formatCompactCurrency }}
                    enablePoints
                    pointSize={6}
                    pointColor={chartTheme.point}
                    pointBorderWidth={2}
                    pointBorderColor={chartTheme.pointBorder}
                    enableArea
                    areaOpacity={0.12}
                    useMesh
                    enableSlices="x"
                    ariaLabel="Sales overview"
                    sliceTooltip={({ slice }) => {
                      const point = slice.points[0];
                      return point ? (
                        <div className="analytics-chart-tooltip">
                          <span>{String(point.data.x)}</span>
                          <strong>{formatWholeCurrency(Number(point.data.y))}</strong>
                        </div>
                      ) : null;
                    }}
                  />
                ) : (
                  <EmptyState message="No sales data in this range" />
                )}
              </div>
            </article>

            <article className="analytics-panel analytics-panel--category">
              <PanelHeader eyebrow="Sales breakdown" title="By category" icon={<PieChart className="analytics-panel__icon" />} tone="violet" />
              <div className="analytics-category-layout">
                <div className="analytics-chart analytics-chart--donut">
                  {categoryChartData.length > 0 ? (
                    <ResponsivePie
                      data={categoryChartData}
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      innerRadius={0.76}
                      padAngle={1}
                      cornerRadius={1}
                      activeOuterRadiusOffset={5}
                      colors={(datum) => breakdownColor(String(datum.id))}
                      borderWidth={3}
                      borderColor={chartTheme.chartBorder}
                      enableArcLabels={false}
                      enableArcLinkLabels={false}
                      sortByValue={false}
                      theme={nivoTheme}
                      tooltip={({ datum }) => {
                        const percentage = categoryTotal > 0 ? ((datum.value / categoryTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <div className="analytics-chart-tooltip">
                            <span>{String(datum.id)}</span>
                            <strong>{formatWholeCurrency(datum.value)} ({percentage}%)</strong>
                          </div>
                        );
                      }}
                    />
                  ) : <EmptyState message="No category sales yet" />}
                  {categoryChartData.length > 0 ? (
                    <div className="analytics-chart__center-label">
                      <strong>{formatWholeCurrency(data.total_sales)}</strong>
                      <span>Total sales</span>
                    </div>
                  ) : null}
                </div>
                <div className="analytics-legend" aria-label="Sales category breakdown">
                  {data.sales_by_category.length > 0 ? data.sales_by_category.map((category) => (
                    <div key={category.category} className="analytics-legend__row">
                      <span className="analytics-legend__label">
                        <span className="analytics-legend__swatch" style={{ backgroundColor: breakdownColor(category.category) }} />
                        <span title={category.category}>{category.category}</span>
                      </span>
                      <strong>
                        {formatWholeCurrency(category.sales_value)}
                        <small>({category.share}%)</small>
                      </strong>
                    </div>
                  )) : <span className="analytics-legend__empty">No category data</span>}
                </div>
              </div>
            </article>
          </div>

          <div className="analytics-grid analytics-grid--supporting">
            <article className="analytics-panel analytics-panel--supporting analytics-panel--top-items">
              <PanelHeader eyebrow="Merchandising" title="Top items by sales value" icon={<TrendingUp className="analytics-panel__icon" />} />
              <TopSellingItems
                items={data.top_selling_items}
                emptyMessage="No item sales in this range"
                emptyIcon={<TrendingUp className="analytics-empty-state__icon" />}
              />
            </article>

            <article className="analytics-panel analytics-panel--supporting">
              <PanelHeader eyebrow="Inventory mix" title="Inventory summary" icon={<Package className="analytics-panel__icon" />} tone="violet" />
              <div className="analytics-inventory-layout">
                <div className="analytics-chart analytics-chart--donut">
                  {inventoryChartData.length > 0 ? (
                    <ResponsivePie
                      data={inventoryChartData}
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      innerRadius={0.76}
                      padAngle={1}
                      cornerRadius={1}
                      activeOuterRadiusOffset={5}
                      colors={(datum) => inventoryColor(String(datum.id))}
                      borderWidth={3}
                      borderColor={chartTheme.chartBorder}
                      enableArcLabels={false}
                      enableArcLinkLabels={false}
                      sortByValue={false}
                      theme={nivoTheme}
                      layers={['arcs', TinyInventorySliceMarkers]}
                      tooltip={({ datum }) => {
                        const percentage = inventoryTotal > 0 ? ((datum.value / inventoryTotal) * 100).toFixed(1) : '0.0';
                        return (
                          <div className="analytics-chart-tooltip">
                            <span>{String(datum.id)}</span>
                            <strong>{datum.value} ({percentage}%)</strong>
                          </div>
                        );
                      }}
                    />
                  ) : <EmptyState message="No inventory yet" />}
                  {inventoryChartData.length > 0 ? (
                    <div className="analytics-chart__center-label">
                      <strong>{data.inventory_summary.total_count}</strong>
                      <span>Total items</span>
                    </div>
                  ) : null}
                </div>
                <div className="analytics-inventory-legend">
                  <div>
                    <span><i className="analytics-inventory-legend__dot" style={{ backgroundColor: inventoryColor('In stock') }} />In stock</span>
                    <strong>{data.inventory_summary.in_stock_count} <small>({data.inventory_summary.in_stock_percentage}%)</small></strong>
                  </div>
                  <div>
                    <span><i className="analytics-inventory-legend__dot" style={{ backgroundColor: inventoryColor('Sold') }} />Sold</span>
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
                    <div className="analytics-trend__bar-label"><span>{data.sales_trend.previous.period}</span><strong>{formatWholeCurrency(previousSales)}</strong></div>
                    <div className="analytics-trend__track"><span className="analytics-trend__bar analytics-trend__bar--previous" style={{ width: previousSalesWidth, backgroundColor: previousTrendColor }} /></div>
                  </div>
                  <div className="analytics-trend__bar-group">
                    <div className="analytics-trend__bar-label"><span>{data.sales_trend.current.period}</span><strong>{formatWholeCurrency(currentSales)}</strong></div>
                    <div className="analytics-trend__track"><span className="analytics-trend__bar analytics-trend__bar--current" style={{ width: currentSalesWidth, backgroundColor: currentTrendColor }} /></div>
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
      {data ? (
        <p className="analytics-page__footnote">
          <Info className="analytics-page__footnote-icon" />
          All values are inclusive of taxes.
        </p>
      ) : null}
    </section>
  );
};
