import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  RotateCcw, 
  Clock, 
  Plus, 
  Pencil, 
  Trash2, 
  IndianRupee, 
  Activity, 
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Check
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { ChangeLogEntry, ChangeLogPage } from '../types';
import { Card, Input, Button, Loader } from '../components/UI';
import { formatDate } from '../utils';

const actionOptions = [
  { value: '', label: 'All actions', icon: LayoutGrid, bg: 'bg-orange-50 text-orange-500 dark:bg-orange-950/20 dark:text-orange-400' },
  { value: 'create', label: 'Create', icon: Plus, bg: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400' },
  { value: 'update', label: 'Update', icon: Pencil, bg: 'bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400' },
  { value: 'sold', label: 'Sold', icon: IndianRupee, bg: 'bg-amber-50 text-amber-500 dark:bg-amber-950/20 dark:text-amber-400' },
  { value: 'delete', label: 'Delete', icon: Trash2, bg: 'bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400' },
];

const humanizeKey = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const getDetailValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const flattenPayload = (
  payload: unknown,
  prefix = '',
): Array<[string, unknown]> => {
  if (payload === null || payload === undefined) {
    return prefix ? [[humanizeKey(prefix), payload]] : [];
  }

  if (typeof payload !== 'object') {
    return [[humanizeKey(prefix), payload]];
  }

  if (Array.isArray(payload)) {
    return [[humanizeKey(prefix), JSON.stringify(payload, null, 2)]];
  }

  return Object.entries(payload).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    return flattenPayload(value, nextKey);
  });
};

const getPayloadSummary = (entry: ChangeLogEntry) => {
  const payload = entry.payload ?? {};
  const invoiceNo =
    payload.invoice_no ?? payload.invoiceNo ?? payload.invoice ?? null;
  const barcode = payload.barcode ?? payload.sku ?? null;

  if (invoiceNo) {
    return `Invoice: ${invoiceNo}`;
  }

  if (barcode) {
    return `Barcode: ${barcode}`;
  }

  return 'Details available below';
};

const getHistorySummary = (entry: ChangeLogEntry) => {
  const payload = entry.payload ?? {};

  if (entry.entity === 'sale' && entry.action === 'create') {
    return {
      title: `Sale created: ${payload.invoice_no ?? 'Unknown invoice'}`,
      details: [
        payload.total !== undefined && ['Total', getDetailValue(payload.total)],
        payload.customer_phone && ['Customer Phone', getDetailValue(payload.customer_phone)],
      ].filter(Boolean) as [string, string][],
    };
  }

  if (entry.entity === 'item' && entry.action === 'create') {
    return {
      title: `New item added: ${payload.sku ?? payload.barcode ?? 'New item'}`,
      details: [
        payload.barcode && ['Barcode', getDetailValue(payload.barcode)],
        payload.sku && ['SKU', getDetailValue(payload.sku)],
      ].filter(Boolean) as [string, string][],
    };
  }

  if (entry.entity === 'item' && entry.action === 'update') {
    const changes = asRecord(payload.changes);
    const barcodeChange = asRecord(changes.barcode);
    const barcode =
      payload.barcode ?? barcodeChange.before ?? 'Unknown item';
    const changeEntries = Object.entries(changes).map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return [
          humanizeKey(key),
          `${getDetailValue(asRecord(value).before)} → ${getDetailValue(asRecord(value).after)}`,
        ];
      }

      return [humanizeKey(key), getDetailValue(value)];
    });

    return {
      title: `Item updated: ${barcode}`,
      details: [
        ['Barcode', getDetailValue(barcode)],
        ...changeEntries,
      ],
    };
  }

  if (entry.entity === 'item' && entry.action === 'sold') {
    const barcode = payload.barcode ?? 'Unknown item';
    const flatDetails = flattenPayload(payload).map(([label, val]) => {
      if (label.startsWith('Pricing.')) {
        return [label.substring(8), val];
      }
      return [label, val];
    });

    return {
      title: `Item sold: ${barcode}`,
      details: flatDetails as [string, string][],
    };
  }

  return {
    title: `${humanizeKey(entry.entity)} ${humanizeKey(entry.action)}`,
    details: flattenPayload(payload),
  };
};

export const History: React.FC = () => {
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const [filters, setFilters] = React.useState({
    barcode: '',
    invoiceNo: '',
    action: '',
    fromDate: '',
    toDate: '',
  });
  const [appliedFilters, setAppliedFilters] = React.useState(filters);
  const [expandedId, setExpandedId] = React.useState<number | string | null>(null);
  const [page, setPage] = React.useState(1);
  const [showActionDropdown, setShowActionDropdown] = React.useState(false);
  
  const actionDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionDropdownRef.current && !actionDropdownRef.current.contains(event.target as Node)) {
        setShowActionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const historyQuery = useQuery<ChangeLogPage>({
    queryKey: queryKeys.history(shopId, { ...appliedFilters, page }),
    queryFn: () => apiClient.getChangeLogHistory({
      barcode: appliedFilters.barcode || undefined,
      invoice_no: appliedFilters.invoiceNo || undefined,
      action: appliedFilters.action || undefined,
      from_date: appliedFilters.fromDate || undefined,
      to_date: appliedFilters.toDate || undefined,
      page,
      limit: 50,
    }),
    enabled: Boolean(shopId),
  });
  const entries = historyQuery.data?.entries ?? [];
  const loading = historyQuery.isPending;
  const error = historyQuery.error instanceof Error ? historyQuery.error.message : '';

  const handleChange = (
    key: keyof typeof filters,
    value: string,
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setPage(1);
  };

  const handleReset = () => {
    const emptyFilters = {
      barcode: '',
      invoiceNo: '',
      action: '',
      fromDate: '',
      toDate: '',
    };
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPage(1);
  };

  const toggleExpand = (id: number | string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="app-page min-h-screen bg-transparent text-slate-800 dark:text-slate-100 transition-colors duration-200">
      <div className="app-page__container max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="app-page__header app-page__header--stacked mb-8 animate-slide-down">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">History</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Search the change log by date range, barcode, invoice number or action.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 mb-8">
          <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm rounded-app-surface">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <Input
                  label="Barcode"
                  placeholder="Enter barcode"
                  value={filters.barcode}
                  onChange={(event) =>
                    handleChange('barcode', event.target.value)
                  }
                  className="py-2.5 rounded-app-control"
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="Invoice No"
                  placeholder="Enter invoice number"
                  value={filters.invoiceNo}
                  onChange={(event) =>
                    handleChange('invoiceNo', event.target.value)
                  }
                  className="py-2.5 rounded-app-control"
                />
              </div>
              <div className="relative flex flex-col w-full" ref={actionDropdownRef}>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-400 mb-1.5">Action</label>
                <div 
                  onClick={() => setShowActionDropdown(!showActionDropdown)}
                  className={`w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded-app-control cursor-pointer select-none transition-all duration-200 flex items-center justify-between h-[46px] ${
                    showActionDropdown 
                      ? 'border-transparent ring-2 ring-amber-500 dark:border-amber-500'
                      : 'border-slate-300 dark:border-slate-800'
                  }`}
                >
                  <span className="text-slate-900 dark:text-slate-100 font-medium text-sm truncate">
                    {actionOptions.find(o => o.value === filters.action)?.label || 'All Actions'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${showActionDropdown ? 'rotate-180' : ''}`} />
                </div>

                {showActionDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-app-surface shadow-xl z-30 p-2 flex flex-col gap-1 w-full animate-fade-in">
                    {actionOptions.map((opt) => {
                      const isSelected = opt.value === filters.action;
                      const Icon = opt.icon;
                      return (
                        <div
                          key={opt.value}
                          onClick={() => {
                            handleChange('action', opt.value);
                            setShowActionDropdown(false);
                          }}
                          className={`relative flex items-center justify-between px-3 py-2.5 rounded-app-control cursor-pointer select-none transition-all ${
                            isSelected 
                              ? 'bg-amber-50/50 dark:bg-amber-950/30 border-l-4 border-amber-500 pl-2' 
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-l-4 border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 rounded-app-control flex items-center justify-center ${opt.bg}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className={`text-sm ${isSelected ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-500 dark:text-slate-300'}`}>
                              {opt.label}
                            </span>
                          </div>
                          {isSelected ? (
                            <div className="w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-500 flex items-center justify-center text-white">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-200 dark:border-slate-700" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="From date"
                  type="datetime-local"
                  value={filters.fromDate}
                  onChange={(event) =>
                    handleChange('fromDate', event.target.value)
                  }
                  className="py-2.5 rounded-app-control text-slate-700 dark:text-slate-300"
                />
              </div>
              <div className="lg:col-span-2">
                <Input
                  label="To date"
                  type="datetime-local"
                  value={filters.toDate}
                  onChange={(event) =>
                    handleChange('toDate', event.target.value)
                  }
                  className="py-2.5 rounded-app-control text-slate-700 dark:text-slate-300"
                />
              </div>
              <div className="lg:col-span-1 flex items-end gap-3">
                <Button type="submit" className="w-full h-[46px] rounded-app-control flex items-center justify-center gap-2" variant="primary">
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </Button>
                <Button
                  type="button"
                  className="w-full h-[46px] rounded-app-control flex items-center justify-center gap-2"
                  variant="secondary"
                  onClick={handleReset}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>
          </Card>
        </form>

        <div className="bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100/80 dark:border-slate-800 p-8 shadow-[0_8px_30px_rgba(0,0,0,0.015)] animate-slide-up">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Change Log Results</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
                {historyQuery.data?.total ?? 0} entries found.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500 font-semibold">
              No history entries were found for the selected filters.
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => {
                const summary = getHistorySummary(entry);
                const isExpanded = expandedId === entry.id;

                // Determine icon
                let iconNode: React.ReactNode;
                let iconBg: string;

                if (entry.entity === 'sale' || entry.action === 'sold') {
                  iconNode = <IndianRupee className="w-5 h-5" />;
                  iconBg = "bg-amber-50 text-amber-500 dark:bg-amber-950/20 dark:text-amber-400";
                } else if (entry.action === 'update') {
                  iconNode = <Pencil className="w-5 h-5" />;
                  iconBg = "bg-blue-50 text-blue-500 dark:bg-blue-950/20 dark:text-blue-400";
                } else if (entry.action === 'delete') {
                  iconNode = <Trash2 className="w-5 h-5" />;
                  iconBg = "bg-red-50 text-red-500 dark:bg-red-950/20 dark:text-red-400";
                } else if (entry.action === 'create') {
                  iconNode = <Plus className="w-5 h-5" />;
                  iconBg = "bg-emerald-50 text-emerald-500 dark:bg-emerald-950/20 dark:text-emerald-400";
                } else {
                  iconNode = <Activity className="w-5 h-5" />;
                  iconBg = "bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400";
                }



                return (
                  <div key={entry.id} className="deferred-list-item border border-slate-100 dark:border-slate-800 rounded-app-surface bg-white dark:bg-slate-900 shadow-xs overflow-hidden transition-all duration-300">
                    <div
                      onClick={() => toggleExpand(entry.id)}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 hover:bg-slate-50/40 dark:hover:bg-slate-800/20 transition-colors cursor-pointer gap-4"
                    >
                      {/* Left details */}
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 ${iconBg} rounded-app-control flex items-center justify-center flex-shrink-0 shadow-sm`}>
                          {iconNode}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {summary.title}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
                            {getPayloadSummary(entry)}
                          </p>
                        </div>
                      </div>

                      {/* Right timestamp & Chevron */}
                      <div className="flex items-center justify-between sm:justify-end ml-14 sm:ml-0 sm:space-x-4">
                        <div className="flex items-center space-x-1.5 text-slate-400 dark:text-slate-500 text-xs font-semibold">
                          <Clock className="w-4 h-4" />
                          <span>{formatDate(entry.created_at ?? new Date())}</span>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>

                    {/* Collapsible change details */}
                    {isExpanded && (
                      <div className="px-6 pb-6 pt-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/40 animate-slide-down">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                          Detailed Changes & Log Metadata
                        </h4>
                        {summary.details.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {summary.details.map(([label, value]) => (
                              <div
                                key={label}
                                className="rounded-app-inset bg-white dark:bg-slate-900/60 p-3.5 border border-slate-100 dark:border-slate-800/80 shadow-xs"
                              >
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                                  {humanizeKey(label)}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                                  {getDetailValue(value)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                            No additional payload details available.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {(historyQuery.data?.pages ?? 0) > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 dark:border-slate-800">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                Page {page} of {historyQuery.data?.pages ?? 1}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={page >= (historyQuery.data?.pages ?? 1)}
                onClick={() => setPage((current) => current + 1)}
                className="flex items-center gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div >

        {error && (
          <Card className="mt-6 p-4 bg-red-50 border-red-200">
            <p className="text-sm text-red-700">{error}</p>
          </Card>
        )}
      </div>
    </div>
  );
};
