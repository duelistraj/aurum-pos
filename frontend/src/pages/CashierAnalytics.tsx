import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import {
  AlertCircle,
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  FileText,
  IndianRupee,
  PackageCheck,
  PieChart,
  Receipt,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import {
  createBreakdownColorMap,
  formatCompactCurrency,
  getChartColor,
  selectEvenlySpacedTicks,
} from '../features/analytics/chartConfig';
import { TopSellingItems } from '../features/analytics/TopSellingItems';
import { CashierAnalyticsResponse } from '../types';
import { formatCurrency, formatWholeCurrency } from '../utils';

const FILTERS = [
  { value: 'all', label: 'All sales' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'platinum', label: 'Platinum' },
  { value: 'stone', label: 'Stones' },
] as const;

const CashierKpi: React.FC<{
  label: string;
  value: string;
  context: string;
  icon: React.ReactNode;
  tone: 'gold' | 'blue' | 'violet' | 'green';
}> = ({ label, value, context, icon, tone }) => (
  <article className={`analytics-kpi analytics-kpi--${tone}`}>
    <div className="analytics-kpi__topline">
      <p className="analytics-kpi__label">{label}</p>
      <span className="analytics-kpi__icon" aria-hidden="true">{icon}</span>
    </div>
    <p className="analytics-kpi__value">{value}</p>
    <span className="analytics-kpi__context">{context}</span>
  </article>
);

export const CashierAnalytics: React.FC = () => {
  const { activeMembership } = useShop();
  const { isDarkMode } = useConfig();
  const shopId = activeMembership?.shop_id ?? '';
  const [metal, setMetal] = React.useState<(typeof FILTERS)[number]['value']>('all');
  const [filterOpen, setFilterOpen] = React.useState(false);
  const filterRef = React.useRef<HTMLDivElement>(null);
  const analyticsQuery = useQuery<CashierAnalyticsResponse>({
    queryKey: queryKeys.cashierAnalytics(shopId, metal),
    queryFn: () => apiClient.getCashierAnalytics(metal),
    enabled: Boolean(shopId),
  });
  const data = analyticsQuery.data;
  const colorMode = isDarkMode ? 'dark' : 'light';
  const chartText = isDarkMode ? '#A5ADB1' : '#63717D';
  const chartGrid = isDarkMode ? '#34383B' : '#E9E5DC';
  const salesLine = isDarkMode ? '#83C59A' : '#3E9161';
  const salesPointBorder = isDarkMode ? '#1A1D20' : '#FFFEFA';
  const chartTheme = {
    background: 'transparent',
    text: { fill: chartText, fontSize: 10, fontWeight: 700 },
    axis: {
      domain: { line: { stroke: 'transparent' } },
      ticks: {
        line: { stroke: 'transparent' },
        text: { fill: chartText, fontSize: 10, fontWeight: 700 },
      },
    },
    grid: { line: { stroke: chartGrid, strokeWidth: 1 } },
    tooltip: {
      container: {
        background: isDarkMode ? '#F7F2E9' : '#182027',
        color: isDarkMode ? '#1A1D20' : '#FFFDF8',
        border: `1px solid ${isDarkMode ? '#E1D6C4' : '#2D3942'}`,
        borderRadius: '.45rem',
        fontSize: '.75rem',
        fontWeight: 700,
      },
    },
  };
  const hourlyData = (data?.sales_by_hour ?? []).map((point) => ({
    x: `${String(point.hour).padStart(2, '0')}:00`,
    y: point.total_amount,
  }));
  const hourlyChartData = [{ id: 'Sales', data: hourlyData }];
  const hourlyTickValues = selectEvenlySpacedTicks(
    hourlyData.map(({ x }) => x),
    6,
  );
  const categoryChartData = (data?.sales_by_category ?? [])
    .filter((category) => category.sales_value > 0)
    .map((category) => ({ id: category.category, value: category.sales_value }));
  const categoryTotal = categoryChartData.reduce((total, category) => total + category.value, 0);
  const breakdownColorByLabel = createBreakdownColorMap(
    categoryChartData.map(({ id }) => id),
    { useMetalColors: metal === 'all', mode: colorMode },
  );
  const breakdownColor = (label: string) => (
    breakdownColorByLabel.get(label) ?? getChartColor(0, colorMode)
  );
  const selectedLabel = FILTERS.find((filter) => filter.value === metal)?.label ?? 'All sales';

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <section className="analytics-page">
      <div className="analytics-page__header">
        <div>
          <p className="dashboard-eyebrow">Today&apos;s performance</p>
          <h1 className="analytics-page__title">Analytics</h1>
          <p className="analytics-page__subtitle">Sales insights for today in India Standard Time.</p>
        </div>
        <div ref={filterRef} className="cashier-analytics-filter">
          <span>Filter sales</span>
          <div className="analytics-filter-wrap">
            <button
              type="button"
              className={`analytics-filter-button${filterOpen ? ' is-open' : ''}`}
              onClick={() => setFilterOpen((current) => !current)}
              aria-label="Filter sales"
              aria-haspopup="listbox"
              aria-expanded={filterOpen}
            >
              <BarChart3 className="analytics-filter-button__icon" />
              <span>{selectedLabel}</span>
              <ChevronDown className={`analytics-filter-button__chevron${filterOpen ? ' is-open' : ''}`} />
            </button>
            {filterOpen ? (
              <div className="analytics-filter-menu" role="listbox" aria-label="Sales type">
                {FILTERS.map((filter) => {
                  const selected = metal === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`analytics-filter-option${selected ? ' is-selected' : ''}`}
                      onClick={() => {
                        setMetal(filter.value);
                        setFilterOpen(false);
                      }}
                    >
                      <span>{filter.label}</span>
                      {selected ? <Check className="analytics-filter-option__check" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {analyticsQuery.error ? (
        <div className="dashboard-alert" role="alert">
          <div className="dashboard-alert__copy">
            <AlertCircle className="dashboard-alert__icon" />
            <div>
              <p className="dashboard-alert__title">Analytics could not be refreshed</p>
              <p className="dashboard-alert__message">{analyticsQuery.error.message}</p>
            </div>
          </div>
          <button type="button" className="dashboard-alert__retry" onClick={() => void analyticsQuery.refetch()}>
            <RefreshCw className={`dashboard-alert__retry-icon${analyticsQuery.isFetching ? ' is-spinning' : ''}`} />
            Retry
          </button>
        </div>
      ) : null}

      {analyticsQuery.isPending && !data ? (
        <div className="analytics-loading" role="status" aria-label="Loading analytics">
          <span className="analytics-loading__spinner" />
          <p>Loading today&apos;s analytics...</p>
        </div>
      ) : data ? (
        <>
          <div className="analytics-kpis analytics-kpis--cashier">
            <CashierKpi label="Today's Sales" value={formatCurrency(data.total_sales)} context={selectedLabel} icon={<IndianRupee />} tone="gold" />
            <CashierKpi label="Invoices" value={String(data.invoice_count)} context="Distinct invoices today" icon={<FileText />} tone="blue" />
            <CashierKpi label="Units Sold" value={String(data.units_sold)} context="Weighted lines count as one" icon={<PackageCheck />} tone="violet" />
            <CashierKpi label="Average Invoice" value={formatCurrency(data.average_invoice_value)} context="Across matching invoices" icon={<Receipt />} tone="green" />
          </div>

          <div className="analytics-grid analytics-grid--primary">
            <article className="analytics-panel analytics-panel--sales">
              <div className="analytics-panel__header">
                <div className="analytics-panel__heading-group">
                  <p className="analytics-panel__eyebrow analytics-panel__eyebrow--green"><Activity className="analytics-panel__icon" />Sales overview</p>
                  <h2 className="analytics-panel__title">{formatWholeCurrency(data.total_sales)}</h2>
                </div>
              </div>
              <div className="analytics-chart analytics-chart--line">
                <ResponsiveLine
                  data={hourlyChartData}
                  margin={{ top: 8, right: 32, bottom: 36, left: 56 }}
                  xScale={{ type: 'point' }}
                  yScale={{ type: 'linear', min: 0, max: 'auto', stacked: false, reverse: false }}
                  curve="monotoneX"
                  colors={[salesLine]}
                  theme={chartTheme}
                  enableGridX={false}
                  enableGridY
                  axisBottom={{ tickValues: hourlyTickValues, tickSize: 0, tickPadding: 10, tickRotation: 0 }}
                  axisLeft={{ tickValues: 5, tickSize: 0, tickPadding: 8, tickRotation: 0, format: formatCompactCurrency }}
                  enablePoints
                  pointSize={6}
                  pointColor={salesLine}
                  pointBorderWidth={2}
                  pointBorderColor={salesPointBorder}
                  enableArea
                  areaOpacity={0.12}
                  useMesh
                  enableSlices="x"
                  ariaLabel="Hourly sales overview"
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
              </div>
            </article>

            <article className="analytics-panel analytics-panel--category">
              <div className="analytics-panel__header">
                <div className="analytics-panel__heading-group">
                  <p className="analytics-panel__eyebrow analytics-panel__eyebrow--violet"><PieChart className="analytics-panel__icon" />Sales breakdown</p>
                  <h2 className="analytics-panel__title">By category</h2>
                </div>
              </div>
              <div className="analytics-category-layout">
                <div className="analytics-chart analytics-chart--donut">
                  {categoryChartData.length ? (
                    <ResponsivePie
                      data={categoryChartData}
                      margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      innerRadius={0.76}
                      padAngle={1}
                      cornerRadius={1}
                      activeOuterRadiusOffset={5}
                      colors={(datum) => breakdownColor(String(datum.id))}
                      borderWidth={3}
                      borderColor={isDarkMode ? '#1A1D20' : '#FFFEFA'}
                      enableArcLabels={false}
                      enableArcLinkLabels={false}
                      sortByValue={false}
                      theme={chartTheme}
                      tooltip={({ datum }) => (
                        <div className="analytics-chart-tooltip">
                          <span>{String(datum.id)}</span>
                          <strong>
                            {formatWholeCurrency(datum.value)} ({((datum.value / categoryTotal) * 100).toFixed(1)}%)
                          </strong>
                        </div>
                      )}
                    />
                  ) : <div className="analytics-empty-state"><PieChart className="analytics-empty-state__icon" /><span>No category sales today</span></div>}
                  {categoryChartData.length ? (
                    <div className="analytics-chart__center-label">
                      <strong>{formatWholeCurrency(data.total_sales)}</strong>
                      <span>Total sales</span>
                    </div>
                  ) : null}
                </div>
                <div className="analytics-legend" aria-label="Sales category breakdown">
                  {data.sales_by_category.length ? data.sales_by_category.map((category) => (
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

          <article className="analytics-panel analytics-panel--supporting cashier-analytics-top cashier-analytics-supporting">
            <div className="analytics-panel__header">
              <div className="analytics-panel__heading-group">
                <p className="analytics-panel__eyebrow analytics-panel__eyebrow--gold"><TrendingUp className="analytics-panel__icon" />Merchandising</p>
                <h2 className="analytics-panel__title">Top items by sales value</h2>
              </div>
            </div>
            <TopSellingItems
              items={data.top_selling_items}
              emptyMessage="No item sales today"
              emptyIcon={<TrendingUp className="analytics-empty-state__icon" />}
            />
          </article>
        </>
      ) : null}
    </section>
  );
};
