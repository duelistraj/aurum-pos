import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Package,
  IndianRupee,
  Calendar,
  ChevronDown,
  Activity,
  Coins,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  ArcElement,
  Filler,
  TooltipItem,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { Card, Loader } from '../components/UI';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { AnalyticsDashboardResponse } from '../types';
import { formatCurrency } from '../utils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  ChartLegend,
  ArcElement,
  Filler
);

// Helper to format dates to YYYY-MM-DD
const formatDateStr = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Date Presets Definitions
const PRESETS = [
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range' },
];

export const Analytics: React.FC = () => {
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  // State for date ranges
  const [activePreset, setActivePreset] = useState<string>('7d');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [selectedJewellery, setSelectedJewellery] = useState<string>('all');
  const [showMetalDropdown, setShowMetalDropdown] = useState<boolean>(false);

  // Set dates based on preset selection
  const applyPreset = (presetId: string) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (presetId) {
      case '7d':
        start.setDate(today.getDate() - 6);
        break;
      case '30d':
        start.setDate(today.getDate() - 29);
        break;
      case 'this_month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'custom':
        // Keep current dates, let user select
        return;
      default:
        break;
    }

    setStartDate(formatDateStr(start));
    setEndDate(formatDateStr(end));
    setActivePreset(presetId);
    setShowDatePicker(false);
  };

  // Initialize dates to Last 7 Days
  useEffect(() => {
    applyPreset('7d');
  }, []);

  const isoStart = startDate ? `${startDate}T00:00:00Z` : '';
  const isoEnd = endDate ? `${endDate}T23:59:59Z` : '';
  const analyticsQuery = useQuery<AnalyticsDashboardResponse>({
    queryKey: queryKeys.analytics(shopId, isoStart, isoEnd, selectedJewellery),
    queryFn: () => apiClient.getDashboardAnalytics(isoStart, isoEnd, selectedJewellery),
    enabled: Boolean(shopId && isoStart && isoEnd),
  });
  const data = analyticsQuery.data ?? null;
  const loading = analyticsQuery.isPending;
  const error = analyticsQuery.error instanceof Error ? analyticsQuery.error.message : null;

  // Format date range display label
  const getRangeLabel = () => {
    if (!startDate || !endDate) return 'Select Date Range';
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${sDate.toLocaleDateString('en-US', options)} - ${eDate.toLocaleDateString('en-US', options)}`;
  };

  // Helper to format large values (e.g. 50K instead of 50000)
  const formatK = (val: number): string => {
    if (val >= 1000) {
      return `${(val / 1000).toFixed(0)}K`;
    }
    return String(val);
  };

  // Chart.js Data and Options Configurations
  const lineChartData = data ? {
    labels: data.sales_overview.map(x => x.date),
    datasets: [
      {
        label: 'Sales',
        data: data.sales_overview.map(x => x.total_amount),
        fill: true,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: '#10B981',
        borderWidth: 2.5,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3,
      }
    ]
  } : null;

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        borderWidth: 1,
        titleFont: { size: 10, weight: 'bold' as const },
        bodyFont: { size: 11, weight: 'bold' as const },
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function(context: TooltipItem<'line'>) {
            return formatCurrency(Number(context.raw));
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 9, weight: 'bold' as const }
        }
      },
      y: {
        grid: {
          color: 'rgba(148, 163, 184, 0.1)',
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 9, weight: 'bold' as const },
          callback: function(value: string | number) {
            return formatK(Number(value));
          }
        }
      }
    }
  };

  const donutColors = ['#8B5CF6', '#3B82F6', '#10B981', '#F97316', '#F59E0B', '#EC4899', '#6366F1', '#EF4444'];
  const categoryChartData = data ? {
    labels: data.sales_by_category.map(x => x.category),
    datasets: [
      {
        data: data.sales_by_category.map(x => x.sales_value),
        backgroundColor: donutColors,
        borderColor: 'transparent',
        borderWidth: 0,
        hoverOffset: 4,
      }
    ]
  } : null;

  const categoryChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: function(context: TooltipItem<'doughnut'>) {
            const value = Number(context.raw);
            const total = context.dataset.data.reduce((sum, item) => sum + Number(item), 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return ` ${context.label}: ${formatCurrency(value)} (${percentage}%)`;
          }
        }
      }
    }
  };

  const inventoryChartData = data ? {
    labels: ['In Stock', 'Sold'],
    datasets: [
      {
        data: [data.inventory_summary.in_stock_count, data.inventory_summary.sold_count],
        backgroundColor: ['#10B981', '#3B82F6'],
        borderColor: 'transparent',
        borderWidth: 0,
      }
    ]
  } : null;

  const inventoryChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: '#0f172a',
        borderColor: '#1e293b',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: function(context: TooltipItem<'doughnut'>) {
            const value = Number(context.raw);
            const total = context.dataset.data.reduce((sum, item) => sum + Number(item), 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return ` ${context.label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="max-w-screen-2xl mx-auto px-6 sm:px-8 py-8 pb-32">
        
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 animate-slide-down">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-8 h-8 text-amber-500" />
              <span>Analytics</span>
            </h1>
            <p className="text-slate-400 dark:text-slate-500 mt-1 font-medium">
              Insights into your business performance.
            </p>
          </div>

          {/* Filters Row */}
          <div className="flex items-center gap-4">
            {/* Jewellery Type Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowMetalDropdown(!showMetalDropdown)}
                className="flex items-center gap-2.5 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-control shadow-sm hover:border-slate-300 dark:hover:border-slate-700 text-sm font-semibold transition-all"
              >
                <Coins className="w-5 h-5 text-amber-500" />
                <span className="capitalize">{selectedJewellery} Jewellery</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {showMetalDropdown && (
                <div className="absolute right-0 mt-2.5 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-50 p-2.5 animate-fade-in animate-slide-up">
                  {['all', 'gold', 'silver', 'platinum'].map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        setSelectedJewellery(m);
                        setShowMetalDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-app-control text-sm font-medium transition-colors capitalize ${
                        selectedJewellery === m
                          ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {m === 'all' ? 'All Jewellery' : m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Picker Trigger & Menu */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-2.5 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-control shadow-sm hover:border-slate-300 dark:hover:border-slate-700 text-sm font-semibold transition-all"
              >
                <Calendar className="w-5 h-5 text-amber-500" />
                <span>{getRangeLabel()}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

            {showDatePicker && (
              <div className="absolute right-0 mt-2.5 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-50 p-4 animate-fade-in">
                <div className="space-y-1 mb-4">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        if (preset.id === 'custom') {
                          setActivePreset('custom');
                        } else {
                          applyPreset(preset.id);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-app-control text-sm font-medium transition-colors ${
                        activePreset === preset.id
                          ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {activePreset === 'custom' && (
                  <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">
                        START DATE
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-app-control text-sm outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 dark:text-slate-500 mb-1">
                        END DATE
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-app-control text-sm outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="w-full mt-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-app-control text-xs font-bold transition-colors"
                    >
                      Apply Custom Range
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-8 p-4 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/30 rounded-app-inset flex items-center gap-3 text-red-700 dark:text-red-400">
            <span className="font-semibold">{error}</span>
          </div>
        )}

        {/* Loading Overlay */}
        {loading ? (
          <div className="flex justify-center items-center py-32">
            <Loader size="lg" />
          </div>
        ) : data ? (
          <div className="space-y-8 animate-slide-up">
            
            {/* 1. KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
              
              {/* Card 1: Total Sales */}
              <Card className="p-6 relative flex flex-col justify-between h-40 shadow-sm border border-slate-100 dark:border-slate-800 rounded-app-surface">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
                      Total Sales
                    </span>
                    <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-app-control flex items-center justify-center shadow-xs">
                      <IndianRupee className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                    {formatCurrency(data.total_sales)}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-3">
                  <span className={`flex items-center gap-0.5 font-bold ${
                    data.total_sales_change_percentage >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {data.total_sales_change_percentage >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(data.total_sales_change_percentage).toFixed(2)}%
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">vs prev period</span>
                </div>
              </Card>

              {/* Card 2: Total Sale Value */}
              <Card className="p-6 relative flex flex-col justify-between h-40 shadow-sm border border-slate-100 dark:border-slate-800 rounded-app-surface">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
                      Total Sale Value
                    </span>
                    <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-app-control flex items-center justify-center shadow-xs">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                    {formatCurrency(data.total_sale_value)}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-3">
                  <span className={`flex items-center gap-0.5 font-bold ${
                    data.total_sale_value_change_percentage >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {data.total_sale_value_change_percentage >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(data.total_sale_value_change_percentage).toFixed(2)}%
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">vs prev period</span>
                </div>
              </Card>

              {/* Card 3: Inventory Items */}
              <Card className="p-6 relative flex flex-col justify-between h-40 shadow-sm border border-slate-100 dark:border-slate-800 rounded-app-surface">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
                      Inventory Items
                    </span>
                    <div className="w-10 h-10 bg-purple-500/10 text-purple-500 rounded-app-control flex items-center justify-center shadow-xs">
                      <Package className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                    {data.inventory_items}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-3">
                  <span className={`flex items-center gap-0.5 font-bold ${
                    data.inventory_items_change_percentage >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {data.inventory_items_change_percentage >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(data.inventory_items_change_percentage).toFixed(2)}%
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">vs prev period</span>
                </div>
              </Card>

              {/* Card 4: Silver Rate */}
              <Card className="p-6 relative flex flex-col justify-between h-40 shadow-sm border border-slate-100 dark:border-slate-800 rounded-app-surface">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
                      Silver Rate (10g)
                    </span>
                    <div className="w-10 h-10 bg-emerald-500/10 text-emerald-500 rounded-app-control flex items-center justify-center shadow-xs">
                      <Coins className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                    {formatCurrency(data.silver_rate_10g)}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-3">
                  <span className={`flex items-center gap-0.5 font-bold ${
                    data.silver_rate_change_percentage >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {data.silver_rate_change_percentage >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(data.silver_rate_change_percentage).toFixed(2)}%
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">vs prev period</span>
                </div>
              </Card>

              {/* Card 5: Total Stock Value */}
              <Card className="p-6 relative flex flex-col justify-between h-40 shadow-sm border border-slate-100 dark:border-slate-800 rounded-app-surface">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-bold uppercase tracking-wider">
                      Total Stock Value
                    </span>
                    <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-app-control flex items-center justify-center shadow-xs">
                      <PieChart className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                    {formatCurrency(data.total_stock_value)}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs mt-3">
                  <span className={`flex items-center gap-0.5 font-bold ${
                    data.total_stock_value_change_percentage >= 0 ? 'text-emerald-500' : 'text-red-500'
                  }`}>
                    {data.total_stock_value_change_percentage >= 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    {Math.abs(data.total_stock_value_change_percentage).toFixed(2)}%
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">vs prev period</span>
                </div>
              </Card>

            </div>

            {/* 2. Charts Section (Sales Overview & Category Breakdown) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              
              {/* Sales Overview Line Chart (60% width) */}
              <Card className="lg:col-span-3 p-8 border border-slate-100 dark:border-slate-800 rounded-[32px] shadow-xs">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <span className="text-slate-400 dark:text-slate-400 text-xs font-bold flex items-center gap-1">
                      <Activity className="w-4 h-4 text-emerald-500" />
                      Sales Overview
                    </span>
                    <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                      {formatCurrency(data.total_sales)}
                    </h3>
                    <div className="text-xs mt-1 text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <span className={`font-bold ${data.total_sales_change_percentage >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {data.total_sales_change_percentage >= 0 ? '↑' : '↓'} {Math.abs(data.total_sales_change_percentage).toFixed(2)}%
                      </span>
                  </div>
                </div>
              </div>
                {/* Chart.js Line Chart */}
                <div className="h-64 w-full select-none">
                  {data.sales_overview.length > 0 && lineChartData ? (
                    <Line data={lineChartData} options={lineChartOptions} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">
                      No sales data in range
                    </div>
                  )}
                </div>
              </Card>

              {/* Sales by Category Donut Chart (40% width) */}
              <Card className="lg:col-span-2 p-8 border border-slate-100 dark:border-slate-800 rounded-[32px] shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-slate-400 dark:text-slate-400 text-xs font-bold flex items-center gap-1 mb-4">
                    <PieChart className="w-4 h-4 text-purple-500" />
                    Sales by Category
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-around gap-8 py-4">
                  {/* Chart.js Donut Chart */}
                  <div className="relative w-44 h-44 flex-shrink-0">
                    {categoryChartData && (
                      <Doughnut data={categoryChartData} options={categoryChartOptions} />
                    )}

                    {/* Donut Center Metrics */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-sm font-extrabold text-slate-800 dark:text-white px-2 break-all max-w-[150px]">
                        {formatCurrency(data.total_sales)}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                        Total Sales
                      </span>
                    </div>
                  </div>

                  {/* Legends */}
                  <div className="space-y-2.5">
                    {(() => {
                      const colors = ['bg-[#8B5CF6]', 'bg-[#3B82F6]', 'bg-[#10B981]', 'bg-[#F97316]', 'bg-[#F59E0B]', 'bg-[#EC4899]', 'bg-[#6366F1]', 'bg-[#EF4444]'];
                      return data.sales_by_category.map((cat, i) => (
                        <div key={cat.category} className="flex items-center gap-2 text-xs font-semibold">
                          <span className={`w-3 h-3 rounded-app-control ${colors[i % colors.length]}`} />
                          <span className="text-slate-500 dark:text-slate-400 max-w-[90px] truncate" title={cat.category}>
                            {cat.category}
                          </span>
                          <span className="text-slate-800 dark:text-slate-200 ml-auto font-bold">
                            {cat.share}%
                          </span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </Card>

            </div>

            {/* 3. Bottom Row Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              
              {/* Widget 1: Top Selling Categories */}
              <Card className="p-8 border border-slate-100 dark:border-slate-800 rounded-[32px] shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-slate-400 dark:text-slate-400 text-xs font-bold flex items-center gap-1.5 mb-5">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    Top Selling Categories
                  </span>
                  
                  <div className="space-y-4">
                    {data.sales_by_category.length > 0 ? (
                      data.sales_by_category.slice(0, 3).map((cat) => (
                        <div key={cat.category} className="flex items-center justify-between pb-3.5 border-b border-slate-50 dark:border-slate-800/40 last:border-b-0">
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                              {cat.category}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                              Share: <span className="font-semibold">{cat.share}%</span>
                            </p>
                          </div>
                          <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                            {formatCurrency(cat.sales_value)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-xs font-semibold text-slate-400">
                        No category data available
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Widget 2: Inventory Summary Ratio */}
              <Card className="p-8 border border-slate-100 dark:border-slate-800 rounded-[32px] shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-slate-400 dark:text-slate-400 text-xs font-bold flex items-center gap-1.5 mb-5">
                    <Package className="w-4 h-4 text-purple-500" />
                    Inventory Summary
                  </span>

                  <div className="flex items-center justify-around gap-8 py-4">
                    {/* Chart.js Ratio Donut */}
                    <div className="relative w-32 h-32 flex-shrink-0">
                      {inventoryChartData && (
                        <Doughnut data={inventoryChartData} options={inventoryChartOptions} />
                      )}
                      
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                        <span className="text-lg font-extrabold text-slate-800 dark:text-white">
                          {data.inventory_summary.total_count}
                        </span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                          Total Items
                        </span>
                      </div>
                    </div>

                    {/* Ratios description */}
                    <div className="space-y-3.5 text-xs font-semibold">
                      <div className="flex flex-col">
                        <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                          In Stock
                        </span>
                        <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-1 pl-4">
                          {data.inventory_summary.in_stock_count} ({data.inventory_summary.in_stock_percentage}%)
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
                          Sold
                        </span>
                        <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-1 pl-4">
                          {data.inventory_summary.sold_count} ({data.inventory_summary.sold_percentage}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Widget 3: Sales Trend vs Previous Period */}
              <Card className="p-8 border border-slate-100 dark:border-slate-800 rounded-[32px] shadow-xs flex flex-col justify-between">
                <div>
                  <span className="text-slate-400 dark:text-slate-400 text-xs font-bold flex items-center gap-1.5 mb-5">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    Sales Trend (vs Last Period)
                  </span>

                  <div className="space-y-5 py-2">
                    <div>
                      <h4 className="text-3xl font-extrabold text-emerald-500">
                        {data.total_sales_change_percentage >= 0 ? '+' : ''}
                        {data.total_sales_change_percentage.toFixed(2)}%
                      </h4>
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1.5">
                        {data.total_sales_change_percentage >= 0 ? 'Increase' : 'Decrease'} in Total Sales
                      </p>
                    </div>

                    {/* Progress Bars comparison */}
                    <div className="space-y-3.5 pt-3">
                      {(() => {
                        const currVal = data.sales_trend.current.sales_value;
                        const prevVal = data.sales_trend.previous.sales_value;
                        const maxVal = Math.max(currVal, prevVal, 100);
                        
                        const currWidth = (currVal / maxVal) * 100;
                        const prevWidth = (prevVal / maxVal) * 100;

                        return (
                          <>
                            {/* Previous period */}
                            <div>
                              <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 font-bold mb-1">
                                <span>{data.sales_trend.previous.period}</span>
                                <span>{formatCurrency(prevVal)}</span>
                              </div>
                              <div className="w-full h-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-full overflow-hidden border border-slate-100 dark:border-slate-800">
                                <div
                                  className="h-full bg-slate-400 dark:bg-slate-600 rounded-full transition-all duration-500"
                                  style={{ width: `${prevWidth}%` }}
                                />
                              </div>
                            </div>
                            
                            {/* Current period */}
                            <div>
                              <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 font-bold mb-1">
                                <span>{data.sales_trend.current.period}</span>
                                <span>{formatCurrency(currVal)}</span>
                              </div>
                              <div className="w-full h-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-full overflow-hidden border border-slate-100 dark:border-slate-800">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 rounded-full transition-all duration-500"
                                  style={{ width: `${currWidth}%` }}
                                />
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </Card>

            </div>

          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 font-bold">
            <span>No dashboard analytics data loaded.</span>
          </div>
        )}

      </div>
    </div>
  );
};
