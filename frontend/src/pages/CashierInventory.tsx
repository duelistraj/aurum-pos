import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Barcode, Loader2, PackageSearch } from 'lucide-react';
import { apiClient, ApiError } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { useShop } from '../context/ShopContext';
import { getCategoryOption } from '../features/items/catalog';
import { formatMetalName } from '../features/metalRates/display';
import { formatCurrency } from '../utils';

const displayNumber = (value: number): string => Number(value).toLocaleString('en-IN', {
  maximumFractionDigits: 3,
});

export const CashierInventory: React.FC = () => {
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const [barcode, setBarcode] = React.useState('');
  const validBarcode = /^\d{8}$/.test(barcode);
  const itemQuery = useQuery({
    queryKey: queryKeys.cashierItem(shopId, barcode),
    queryFn: () => apiClient.getCashierItemByBarcode(barcode),
    enabled: Boolean(shopId && validBarcode),
    retry: false,
  });
  const item = itemQuery.data;
  const notFound = itemQuery.error instanceof ApiError && itemQuery.error.status === 404;

  React.useEffect(() => {
    setBarcode('');
  }, [shopId]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (validBarcode) void itemQuery.refetch();
  };

  return (
    <section className="app-page min-h-screen bg-transparent text-slate-800 dark:text-slate-100">
      <div className="app-page__container mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="app-page__header app-page__header--stacked mb-8 animate-slide-down">
          <h1>Inventory</h1>
          <p>Scan or enter an 8-digit barcode to check an item.</p>
        </header>

        <form onSubmit={handleSubmit} className="rounded-app-surface border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <label htmlFor="cashier-barcode" className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
            Barcode
          </label>
          <div className="relative">
            <Barcode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              id="cashier-barcode"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              maxLength={8}
              value={barcode}
              onChange={(event) => setBarcode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Scan or enter barcode"
              className="h-12 w-full rounded-app-control border border-slate-300 bg-white pl-12 pr-12 text-base font-semibold tracking-wider text-slate-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              aria-describedby="cashier-barcode-help"
            />
            {itemQuery.isFetching ? (
              <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-amber-600" aria-label="Looking up item" />
            ) : null}
          </div>
          <p id="cashier-barcode-help" className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            The item appears automatically after all 8 digits are entered.
          </p>
        </form>

        {barcode.length > 0 && !validBarcode ? (
          <p className="mt-4 text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">
            Enter all 8 digits to view item details.
          </p>
        ) : null}

        {notFound ? (
          <div className="mt-5 flex items-center gap-3 rounded-app-control border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
            <PackageSearch className="h-5 w-5 flex-none" />
            <p className="font-semibold">No in-stock or sold item matches barcode {barcode}.</p>
          </div>
        ) : itemQuery.error && !notFound ? (
          <div className="mt-5 flex items-center gap-3 rounded-app-control border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200" role="alert">
            <AlertCircle className="h-5 w-5 flex-none" />
            <p className="font-semibold">{itemQuery.error.message}</p>
          </div>
        ) : null}

        {item ? (
          <section className="mt-5 rounded-app-surface border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900" aria-labelledby="cashier-item-name">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Matched item</p>
                <h2 id="cashier-item-name" className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{item.name}</h2>
              </div>
              <span className={`inline-flex min-w-24 justify-center rounded-full border px-3 py-1 text-sm font-bold ${item.status === 'in_stock' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                {item.status === 'in_stock' ? 'In Stock' : 'Sold'}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-5 pt-5 sm:grid-cols-3">
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Barcode</dt><dd className="mt-1 font-semibold">{item.barcode}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">SKU</dt><dd className="mt-1 font-semibold">{item.sku}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Category</dt><dd className="mt-1 font-semibold">{getCategoryOption(item.category).label}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Type</dt><dd className="mt-1 font-semibold">{item.item_type === 'stone' ? 'Stone' : 'Jewellery'}</dd></div>
              {item.item_type === 'stone' ? (
                <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Ratti</dt><dd className="mt-1 font-semibold">{item.ratti === null ? '-' : displayNumber(item.ratti)}</dd></div>
              ) : (
                <>
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Metal</dt><dd className="mt-1 font-semibold">{formatMetalName(item.metal)}</dd></div>
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Purity</dt><dd className="mt-1 font-semibold">{item.purity === null ? '-' : `${displayNumber(item.purity)}%`}</dd></div>
                  <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Weight</dt><dd className="mt-1 font-semibold">{item.net_weight === null ? '-' : `${displayNumber(item.net_weight)} gram`}</dd></div>
                </>
              )}
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">HSN</dt><dd className="mt-1 font-semibold">{item.hsn}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">GST</dt><dd className="mt-1 font-semibold">{displayNumber(item.gst_rate_percent)}%</dd></div>
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Current selling price</dt>
                <dd className="mt-1 font-bold text-amber-700 dark:text-amber-400">
                  {item.price.state === 'available' && item.price.amount !== null
                    ? formatCurrency(item.price.amount)
                    : item.price.state === 'requires_weight'
                      ? 'Enter weight during sale'
                      : 'Metal rate unavailable'}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>
    </section>
  );
};
