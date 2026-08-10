import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Clock,
  IndianRupee,
  Package,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { formatMetalName } from '../features/metalRates/display';
import { useIndiaDate } from '../hooks/useIndiaDate';
import { useRotatingMetalRate } from '../hooks/useRotatingMetalRate';
import { ChangeLogEntry, DashboardMetalRate, DashboardSummary } from '../types';
import { formatCurrency } from '../utils';

const EMPTY_METAL_RATES: DashboardMetalRate[] = [];

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const safeFormatCurrency = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? formatCurrency(value) : formatCurrency(0);

const formatActivityTime = (dateString?: string | null): string => {
  if (!dateString) return 'Time unavailable';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();
};

const humanizeKey = (key: string): string => key
  .replace(/_/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const describeValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'number') {
    return /total|amount|price/.test(key) ? safeFormatCurrency(value) : value.toString();
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const getActivitySummary = (activity: ChangeLogEntry): {
  title: string;
  details: [string, string][];
} => {
  const payload = activity.payload || {};

  if (activity.entity === 'sale' && activity.action === 'create') {
    return {
      title: `Sale created: ${payload.invoice_no ?? 'Unknown invoice'}`,
      details: [
        payload.total !== undefined ? ['Total', describeValue('total', payload.total)] : null,
        payload.customer_phone ? ['Customer phone', String(payload.customer_phone)] : null,
      ].filter((detail): detail is [string, string] => detail !== null),
    };
  }

  if (activity.entity === 'item' && activity.action === 'create') {
    return {
      title: `New item added: ${payload.sku ?? payload.barcode ?? 'New item'}`,
      details: [
        payload.barcode ? ['Barcode', String(payload.barcode)] : null,
        payload.sku ? ['SKU', String(payload.sku)] : null,
      ].filter((detail): detail is [string, string] => detail !== null),
    };
  }

  if (activity.entity === 'item' && activity.action === 'update') {
    const changes = asRecord(payload.changes);
    const barcode = payload.barcode ?? asRecord(changes.barcode).before ?? 'Unknown item';
    return {
      title: `Item updated: ${barcode}`,
      details: [
        ['Barcode', String(barcode)],
        ...Object.entries(changes).map(([key, value]) => {
          const change = asRecord(value);
          return [
            humanizeKey(key),
            `${describeValue(key, change.before)} -> ${describeValue(key, change.after)}`,
          ] as [string, string];
        }),
      ],
    };
  }

  return {
    title: `${humanizeKey(activity.entity)} ${humanizeKey(activity.action)}`,
    details: Object.entries(payload)
      .filter(([key]) => key !== 'state_code')
      .map(([key, value]) => [humanizeKey(key), describeValue(key, value)] as [string, string]),
  };
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  context: string;
  tone: 'gold' | 'blue' | 'violet' | 'green' | 'slate';
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, context, tone, loading = false }) => (
  <article className={`dashboard-stat dashboard-stat--${tone}`}>
    <div className="dashboard-stat__icon" aria-hidden="true">{icon}</div>
    {loading ? (
      <div className="dashboard-stat__loading" role="status" aria-label={`Loading ${label}`}>
        <span className="dashboard-skeleton dashboard-skeleton--label" />
        <span className="dashboard-skeleton dashboard-skeleton--value" />
        <span className="dashboard-skeleton dashboard-skeleton--context" />
      </div>
    ) : (
      <>
        <p className="dashboard-stat__label">{label}</p>
        <p className="dashboard-stat__value">{value}</p>
        <p className="dashboard-stat__context">{context}</p>
      </>
    )}
  </article>
);

const IngotIcon: React.FC = () => (
  <svg className="dashboard-stat__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="m5 12 2-4h10l2 4" />
    <path d="M3 13h8v5H3zM13 13h8v5h-8zM7 8V5h10v3" />
  </svg>
);

const activityTone = (activity: ChangeLogEntry): string => {
  if (activity.entity === 'sale') return 'dashboard-activity__icon--gold';
  if (activity.action === 'update') return 'dashboard-activity__icon--blue';
  return 'dashboard-activity__icon--green';
};

const activityIcon = (activity: ChangeLogEntry): React.ReactNode => {
  if (activity.entity === 'sale') return <IndianRupee className="dashboard-activity__svg" />;
  if (activity.action === 'update') return <Pencil className="dashboard-activity__svg" />;
  if (activity.entity === 'item') return <Package className="dashboard-activity__svg" />;
  return <Plus className="dashboard-activity__svg" />;
};

interface ActivityRowProps {
  activity: ChangeLogEntry;
}

const ActivityRow: React.FC<ActivityRowProps> = ({ activity }) => {
  const activitySummary = getActivitySummary(activity);
  const firstDetail = activitySummary.details[0];

  return (
    <li className="dashboard-activity__row">
      <div className={`dashboard-activity__icon ${activityTone(activity)}`} aria-hidden="true">
        {activityIcon(activity)}
      </div>
      <div className="dashboard-activity__copy">
        <p className="dashboard-activity__title">{activitySummary.title}</p>
        <p className="dashboard-activity__detail">
          {firstDetail ? `${firstDetail[0]}: ${firstDetail[1]}` : 'Recent business update'}
        </p>
      </div>
      <time className="dashboard-activity__time" dateTime={activity.created_at ?? undefined}>
        <Clock className="dashboard-activity__time-icon" />
        {formatActivityTime(activity.created_at)}
      </time>
    </li>
  );
};

export const Dashboard: React.FC = () => {
  const { activeMembership, user } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const dashboardQuery = useQuery<DashboardSummary>({
    queryKey: queryKeys.dashboard(shopId),
    queryFn: () => apiClient.getDashboardSummary(),
    enabled: Boolean(shopId),
  });
  const summary = dashboardQuery.data ?? null;
  const loading = dashboardQuery.isPending && !summary;
  const queryError = dashboardQuery.error;
  const currentIndiaDate = useIndiaDate();
  const welcomeName = user?.full_name?.trim().split(/\s+/)[0] || 'there';
  const visibleActivity = summary?.recent_activity.filter(
    (activity) => !(activity.entity === 'item' && activity.action === 'sold'),
  ) ?? [];
  const dashboardMetalRates = React.useMemo(() => {
    if (summary?.metal_rates?.length) return summary.metal_rates;
    if (summary && Number.isFinite(summary.Silver_rate_per_10g) && summary.Silver_rate_per_10g > 0) {
      return [{ metal: 'silver', rate_per_10g: summary.Silver_rate_per_10g }];
    }
    return EMPTY_METAL_RATES;
  }, [summary]);
  const activeMetalRate = useRotatingMetalRate(dashboardMetalRates);

  const stats: StatCardProps[] = [
    {
      icon: <IndianRupee className="dashboard-stat__svg" />,
      label: 'Total sales',
      value: summary ? safeFormatCurrency(summary.total_sales_amount) : formatCurrency(0),
      context: 'All recorded sales',
      tone: 'gold',
    },
    {
      icon: <ArrowUpRight className="dashboard-stat__svg" />,
      label: 'Catalog value',
      value: summary ? safeFormatCurrency(summary.total_sale_value) : formatCurrency(0),
      context: 'Estimated sale value',
      tone: 'blue',
    },
    {
      icon: <Package className="dashboard-stat__svg" />,
      label: 'Inventory items',
      value: summary ? String(summary.inventory_items) : '0',
      context: 'Units currently in stock',
      tone: 'violet',
    },
    {
      icon: <IngotIcon />,
      label: activeMetalRate ? `${formatMetalName(activeMetalRate.metal)} rate` : 'Metal rate',
      value: activeMetalRate ? safeFormatCurrency(activeMetalRate.rate_per_10g) : 'N/A',
      context: activeMetalRate ? 'Current rate per 10g' : 'No rates configured',
      tone: 'green',
    },
    {
      icon: <Activity className="dashboard-stat__svg" />,
      label: 'Stock value',
      value: summary ? safeFormatCurrency(summary.total_stock_value) : formatCurrency(0),
      context: 'Estimated inventory value',
      tone: 'slate',
    },
  ];

  return (
    <section className="dashboard-page">
      <div className="dashboard-page__header">
        <div>
          <p className="dashboard-eyebrow">Business overview</p>
          <h1 className="dashboard-page__title">Welcome back, {welcomeName}</h1>
          <p className="dashboard-page__subtitle">Here is an overview of your shop today.</p>
          <p className="dashboard-page__date"><time>{currentIndiaDate}</time></p>
        </div>
        <Link to="/transactions" className="dashboard-header-link">
          <Activity className="dashboard-header-link__icon" />
          View activity
        </Link>
      </div>

      {queryError ? (
        <div className="dashboard-alert" role="alert">
          <div className="dashboard-alert__copy">
            <AlertCircle className="dashboard-alert__icon" />
            <div>
              <p className="dashboard-alert__title">Dashboard data could not be refreshed</p>
              <p className="dashboard-alert__message">
                {queryError instanceof Error ? queryError.message : 'Check your connection and try again.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="dashboard-alert__retry"
            onClick={() => void dashboardQuery.refetch()}
            disabled={dashboardQuery.isFetching}
          >
            <RefreshCw className={`dashboard-alert__retry-icon${dashboardQuery.isFetching ? ' is-spinning' : ''}`} />
            Retry
          </button>
        </div>
      ) : null}

      <div className="dashboard-stats" aria-label="Shop metrics">
        {stats.map((stat) => <StatCard key={stat.label} {...stat} loading={loading} />)}
      </div>

      <section className="dashboard-activity" aria-labelledby="recent-activity-title">
        <div className="dashboard-activity__header">
          <div>
            <p className="dashboard-eyebrow">What is happening</p>
            <h2 id="recent-activity-title" className="dashboard-activity__heading">Recent activity</h2>
          </div>
          <Link to="/transactions" className="dashboard-section-link">View all</Link>
        </div>

        {loading ? (
          <div className="dashboard-activity__loading" role="status" aria-label="Loading recent activity">
            <span className="dashboard-skeleton dashboard-skeleton--activity" />
            <span className="dashboard-skeleton dashboard-skeleton--activity" />
            <span className="dashboard-skeleton dashboard-skeleton--activity" />
          </div>
        ) : visibleActivity.length > 0 ? (
          <ul className="dashboard-activity__list">
            {visibleActivity.slice(0, 4).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
          </ul>
        ) : (
          <div className="dashboard-activity__empty">
            <div className="dashboard-activity__empty-icon"><Activity className="dashboard-stat__svg" /></div>
            <p>No recent activity yet</p>
            <span>Your latest sales and inventory updates will appear here.</span>
          </div>
        )}
      </section>
    </section>
  );
};
