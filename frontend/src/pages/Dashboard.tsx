import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  IndianRupee, 
  Package, 
  AlertCircle, 
  ArrowUpRight, 
  PieChart, 
  Activity, 
  Plus, 
  Pencil, 
  Clock 
} from 'lucide-react';
import { Card, Loader } from '../components/UI';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { DashboardSummary, ChangeLogEntry } from '../types';
import { formatCurrency } from '../utils';

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

interface StatCardProps {
  icon: React.ReactNode;
  title: string;
  value: string;
  iconBgClass: string;
  iconColorClass: string;
  showWarning?: boolean;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  title,
  value,
  iconBgClass,
  iconColorClass,
  showWarning = false,
  loading,
}) => (
  <Card className="p-6 relative flex flex-col items-center justify-center h-40 shadow-[0_8px_30px_rgba(0,0,0,0.015)] rounded-[24px] border border-slate-100 dark:border-slate-800 hover:shadow-[0_12px_35px_rgba(0,0,0,0.03)] transition-all duration-300">
    {showWarning && (
      <div className="absolute top-4 right-4 text-orange-500 cursor-pointer" title="Some inventory stock items require review">
        <AlertCircle className="w-5 h-5" />
      </div>
    )}
    {loading ? (
      <Loader size="sm" />
    ) : (
      <div className="flex flex-col items-center text-center">
        <div className={`w-12 h-12 ${iconBgClass} ${iconColorClass} rounded-app-control flex items-center justify-center mb-3 flex-shrink-0`}>
          {icon}
        </div>
        <p className="text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-2">{value}</p>
      </div>
    )}
  </Card>
);

const IngotIcon: React.FC = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="14" width="9" height="5" rx="1" />
    <rect x="13" y="14" width="9" height="5" rx="1" />
    <rect x="7" y="6" width="10" height="5" rx="1" />
  </svg>
);

export const Dashboard: React.FC = () => {
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const dashboardQuery = useQuery<DashboardSummary>({
    queryKey: queryKeys.dashboard(shopId),
    queryFn: () => apiClient.getDashboardSummary(),
    enabled: Boolean(shopId),
  });
  const summary = dashboardQuery.data ?? null;
  const loading = dashboardQuery.isPending;
  const isHealthy = dashboardQuery.isSuccess;

  const safeFormatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) {
      return '₹NaN';
    }
    return formatCurrency(val);
  };

  const formatActivityTime = (dateStr?: string) => {
    if (!dateStr) return '12:00 am';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
    } catch {
      return '12:00 am';
    }
  };

  const humanizeKey = (key: string) =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

  const describeValue = (key: string, value: unknown) => {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value === 'number') {
      if (/total|amount|price/.test(key)) {
        return safeFormatCurrency(value);
      }
      return value.toString();
    }

    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  };

  const getActivitySummary = (activity: ChangeLogEntry) => {
    const payload = activity.payload || {};

    if (activity.entity === 'sale' && activity.action === 'create') {
      return {
        title: `Sale created: ${payload.invoice_no ?? 'Unknown invoice'}`,
        details: [
          payload.total !== undefined && ['Total', describeValue('total', payload.total)],
          payload.customer_phone && ['Customer Phone', String(payload.customer_phone)],
        ].filter(Boolean) as [string, string][],
      };
    }

    if (activity.entity === 'item' && activity.action === 'create') {
      return {
        title: `New item added: ${payload.sku ?? payload.barcode ?? 'New item'}`,
        details: [
          payload.barcode && ['Barcode', String(payload.barcode)],
          payload.sku && ['SKU', String(payload.sku)],
        ].filter(Boolean) as [string, string][],
      };
    }

    if (activity.entity === 'item' && activity.action === 'update') {
      const changes = asRecord(payload.changes);
      const barcode = payload.barcode ?? asRecord(changes.barcode).before ?? 'Unknown item';
      const details: [string, string][] = [
        ['Barcode', String(barcode)],
        ...Object.entries(changes).map(([key, value]) => {
          const change = asRecord(value);
          const beforeValue = describeValue(key, change.before);
          const afterValue = describeValue(key, change.after);
          return [humanizeKey(key), `${beforeValue} → ${afterValue}`] as [string, string];
        }),
      ];

      return {
        title: `Item updated: ${barcode}`,
        details,
      };
    }

    const details = Object.entries(payload)
      .filter(([key]) => key !== 'state_code')
      .map(([key, value]) => [humanizeKey(key), describeValue(key, value)] as [string, string]);

    return {
      title: `${humanizeKey(activity.entity)} ${humanizeKey(activity.action)}`,
      details,
    };
  };

  const visibleActivity = summary?.recent_activity.filter(
    (activity) => !(activity.entity === 'item' && activity.action === 'sold')
  ) ?? [];

  return (
    <div className="min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-screen-2xl mx-auto px-6 sm:px-8 py-8">
        
        {/* Welcome Section */}
        <div className="mb-6 animate-slide-down">
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            Welcome back! 👋
          </h2>
          <p className="text-slate-400 dark:text-slate-555 mt-1 font-medium">
            Manage your inventory and sales efficiently.
          </p>
        </div>

        {/* Connection Status Banner */}
        {!loading && (
          <div className="mb-8 animate-slide-up">
            <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100/70 dark:border-emerald-900/30 px-6 py-4 rounded-[20px] shadow-sm">
              <div className="flex items-center space-x-3">
                {isHealthy ? (
                  <>
                    <div className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold tracking-wide text-sm">
                      Backend API is connected
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <span className="text-red-700 dark:text-red-400 font-semibold tracking-wide text-sm animate-pulse">
                      Unable to connect to backend API
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
          <StatCard
            icon={<IndianRupee className="w-6 h-6" />}
            title="Total Sales"
            value={summary ? safeFormatCurrency(summary.total_sales_amount) : '₹0'}
            iconBgClass="bg-amber-50 dark:bg-amber-950/20"
            iconColorClass="text-amber-500 dark:text-amber-400"
            loading={loading}
          />
          <StatCard
            icon={<ArrowUpRight className="w-6 h-6" />}
            title="Total Sale Value"
            value={summary ? safeFormatCurrency(summary.total_sale_value) : '₹NaN'}
            iconBgClass="bg-blue-50 dark:bg-blue-950/20"
            iconColorClass="text-blue-500 dark:text-blue-400"
            loading={loading}
          />
          <StatCard
            icon={<Package className="w-6 h-6" />}
            title="Inventory Items"
            value={summary ? String(summary.inventory_items) : '0'}
            iconBgClass="bg-purple-50 dark:bg-purple-950/20"
            iconColorClass="text-purple-500 dark:text-purple-400"
            loading={loading}
          />
          <StatCard
            icon={<IngotIcon />}
            title="Silver Rate (10g)"
            value={summary ? safeFormatCurrency(summary.Silver_rate_per_10g) : '₹0'}
            iconBgClass="bg-emerald-50 dark:bg-emerald-950/20"
            iconColorClass="text-emerald-500 dark:text-emerald-400"
            loading={loading}
          />
          <StatCard
            icon={<PieChart className="w-6 h-6" />}
            title="Total Stock Value"
            value={summary ? safeFormatCurrency(summary.total_stock_value) : '₹0'}
            iconBgClass="bg-orange-50 dark:bg-orange-950/20"
            iconColorClass="text-orange-500 dark:text-orange-400"
            loading={loading}
          />
        </div>

        {/* Recent Activity Card */}
        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100/80 dark:border-slate-800 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.01)] animate-slide-up">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Recent Activity
              </h2>
            </div>
            <Link
              to="/history"
              className="px-4 py-1.5 bg-orange-50/70 hover:bg-orange-100/80 text-orange-600 dark:bg-orange-950/20 dark:hover:bg-orange-900/30 dark:text-orange-400 rounded-full text-xs font-bold transition-colors cursor-pointer"
            >
              View All
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader />
            </div>
          ) : visibleActivity.length ? (
            <div className="space-y-4">
              {visibleActivity.slice(0, 3).map((activity) => {
                const activitySummary = getActivitySummary(activity);
                
                // Determine icon type
                let iconNode = <Plus className="w-5 h-5" />;
                let iconBg = "bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400";
                
                if (activity.entity === 'sale') {
                  iconNode = <IndianRupee className="w-5 h-5" />;
                  iconBg = "bg-amber-50 text-amber-500 dark:bg-amber-950/20 dark:text-amber-400";
                } else if (activity.action === 'update') {
                  iconNode = <Pencil className="w-5 h-5" />;
                  iconBg = "bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400";
                }

                // Extract fields
                const barcodeDetail = activitySummary.details.find(([label]) => label === 'Barcode');
                const barcodeText = barcodeDetail ? barcodeDetail[1] : '';

                const rawBarcode = barcodeText || activity.payload?.barcode;
                const barcodeToShow = rawBarcode ? String(rawBarcode) : '';

                return (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 border border-slate-100 dark:border-slate-800 rounded-app-inset bg-white dark:bg-slate-900 hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Left details */}
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 ${iconBg} rounded-app-control flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        {iconNode}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                          {activitySummary.title}
                        </p>
                        {barcodeToShow && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                            Barcode: <span className="text-slate-600 dark:text-slate-400 font-semibold">{barcodeToShow}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right timestamp */}
                    <div className="flex items-center space-x-1.5 text-slate-400 dark:text-slate-500 text-xs font-semibold">
                      <Clock className="w-4 h-4" />
                      <span>{formatActivityTime(activity.created_at || undefined)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-slate-400 dark:text-slate-500 py-12">
              <p className="font-semibold">No recent activity yet</p>
              <p className="text-xs mt-1">Your recent transactions and updates will appear here</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
