import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Clock,
  Coins,
  FileText,
  IndianRupee,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { useIndiaDate } from '../hooks/useIndiaDate';
import { CashierDashboardSummary } from '../types';
import { formatCurrency } from '../utils';

interface CashierStatProps {
  label: string;
  value: string;
  context: string;
  tone: 'gold' | 'blue' | 'violet' | 'green';
  icon: React.ReactNode;
  loading: boolean;
}

const CashierStat: React.FC<CashierStatProps> = ({ label, value, context, tone, icon, loading }) => (
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

const formatActivityTime = (dateString?: string | null): string => {
  if (!dateString) return 'Just now';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateString)).toLowerCase();
};

const SoldActivityRow: React.FC<{
  activity: CashierDashboardSummary['recent_sold_activity'][number];
}> = ({ activity }) => {
  const barcode = String(activity.payload.barcode ?? 'Unknown item');
  const weight = Number(activity.payload.weight_grams ?? 0);
  const quantity = Number(activity.payload.quantity ?? 0);
  const detail = weight > 0
    ? `${weight.toLocaleString('en-IN')} gram sold`
    : `${quantity.toLocaleString('en-IN')} ${quantity === 1 ? 'piece' : 'pieces'} sold`;

  return (
    <li className="dashboard-activity__row">
      <div className="dashboard-activity__icon" aria-hidden="true">
        <IndianRupee className="dashboard-activity__svg" />
      </div>
      <div className="dashboard-activity__copy">
        <p className="dashboard-activity__title">Item sold: {barcode}</p>
        <p className="dashboard-activity__detail">{detail}</p>
      </div>
      <time className="dashboard-activity__time" dateTime={activity.created_at ?? undefined}>
        <Clock className="dashboard-activity__time-icon" />
        {formatActivityTime(activity.created_at)}
      </time>
    </li>
  );
};

export const CashierDashboard: React.FC = () => {
  const { activeMembership, user } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const summaryQuery = useQuery<CashierDashboardSummary>({
    queryKey: queryKeys.cashierDashboard(shopId),
    queryFn: () => apiClient.getCashierDashboardSummary(),
    enabled: Boolean(shopId),
  });
  const rateByMetal = Object.fromEntries(
    (summaryQuery.data?.metal_rates ?? []).map((rate) => [rate.metal.toLowerCase(), rate.rate_per_10g]),
  );
  const welcomeName = user?.full_name?.trim().split(/\s+/)[0] || 'there';
  const currentIndiaDate = useIndiaDate();
  const loading = summaryQuery.isPending && !summaryQuery.data;

  const stats: Omit<CashierStatProps, 'loading'>[] = [
    {
      label: "Today's Sales",
      value: formatCurrency(summaryQuery.data?.today_sales ?? 0),
      context: 'Sales recorded today',
      tone: 'gold',
      icon: <IndianRupee className="dashboard-stat__svg" />,
    },
    {
      label: 'Invoices Today',
      value: String(summaryQuery.data?.invoice_count ?? 0),
      context: 'Completed sales today',
      tone: 'green',
      icon: <FileText className="dashboard-stat__svg" />,
    },
    {
      label: 'Gold Rate per 10g',
      value: formatCurrency(rateByMetal.gold ?? 0),
      context: 'Current shop rate',
      tone: 'gold',
      icon: <Coins className="dashboard-stat__svg" />,
    },
    {
      label: 'Silver Rate per 10g',
      value: formatCurrency(rateByMetal.silver ?? 0),
      context: 'Current shop rate',
      tone: 'blue',
      icon: <Coins className="dashboard-stat__svg" />,
    },
    {
      label: 'Platinum Rate per 10g',
      value: formatCurrency(rateByMetal.platinum ?? 0),
      context: 'Current shop rate',
      tone: 'violet',
      icon: <Coins className="dashboard-stat__svg" />,
    },
  ];

  return (
    <section className="dashboard-page">
      <div className="dashboard-page__header">
        <div>
          <p className="dashboard-eyebrow">Today at a glance</p>
          <h1 className="dashboard-page__title">Welcome back, {welcomeName}</h1>
          <p className="dashboard-page__subtitle">Here are today&apos;s sales, invoices, and current metal rates.</p>
          <p className="dashboard-page__date"><time>{currentIndiaDate}</time></p>
        </div>
      </div>

      {summaryQuery.error ? (
        <div className="dashboard-alert" role="alert">
          <div className="dashboard-alert__copy">
            <AlertCircle className="dashboard-alert__icon" />
            <div>
              <p className="dashboard-alert__title">Dashboard data could not be refreshed</p>
              <p className="dashboard-alert__message">{summaryQuery.error.message}</p>
            </div>
          </div>
          <button type="button" className="dashboard-alert__retry" onClick={() => void summaryQuery.refetch()}>
            <RefreshCw className={`dashboard-alert__retry-icon${summaryQuery.isFetching ? ' is-spinning' : ''}`} />
            Retry
          </button>
        </div>
      ) : null}

      <div className="dashboard-stats" aria-label="Today's shop metrics">
        {stats.map((stat) => <CashierStat key={stat.label} {...stat} loading={loading} />)}
      </div>

      <section className="dashboard-activity" aria-labelledby="cashier-recent-activity-title">
        <div className="dashboard-activity__header">
          <div>
            <p className="dashboard-eyebrow">Latest sold items</p>
            <h2 id="cashier-recent-activity-title" className="dashboard-activity__heading">
              Recent activity
            </h2>
          </div>
          <Link to="/transactions" className="dashboard-section-link">View all</Link>
        </div>

        {loading ? (
          <div className="dashboard-activity__loading" role="status" aria-label="Loading recent activity">
            <span className="dashboard-skeleton dashboard-skeleton--activity" />
            <span className="dashboard-skeleton dashboard-skeleton--activity" />
            <span className="dashboard-skeleton dashboard-skeleton--activity" />
          </div>
        ) : (summaryQuery.data?.recent_sold_activity ?? []).length > 0 ? (
          <ul className="dashboard-activity__list">
            {summaryQuery.data?.recent_sold_activity.map((activity) => (
              <SoldActivityRow key={activity.id} activity={activity} />
            ))}
          </ul>
        ) : (
          <div className="dashboard-activity__empty">
            <div className="dashboard-activity__empty-icon">
              <Activity className="dashboard-stat__svg" />
            </div>
            <p>No sold activity yet</p>
            <span>Completed item sales will appear here.</span>
          </div>
        )}
      </section>
    </section>
  );
};
