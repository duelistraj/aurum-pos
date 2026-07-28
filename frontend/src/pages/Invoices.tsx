import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  RefreshCw,
  Search,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Alert, Badge, Button, Card, Input, Loader, Select } from '../components/UI';
import { useShop } from '../context/ShopContext';
import type { InvoicePdfStatus, InvoiceSummary } from '../types';
import { downloadUrl, formatCurrency, formatDate } from '../utils';

interface InvoiceFilters {
  search: string;
  fromDate: string;
  toDate: string;
  pdfStatus: '' | InvoicePdfStatus;
}

interface ShopProfile {
  name: string;
  legal_name: string;
  tax_id: string;
  address: string;
  state: string;
  state_code: string;
  invoice_prefix: string;
  tax_rate_percent: string;
}

const EMPTY_FILTERS: InvoiceFilters = {
  search: '',
  fromDate: '',
  toDate: '',
  pdfStatus: '',
};

const EMPTY_PROFILE: ShopProfile = {
  name: '',
  legal_name: '',
  tax_id: '',
  address: '',
  state: '',
  state_code: '',
  invoice_prefix: 'INV',
  tax_rate_percent: '3',
};

const STATUS_OPTIONS = [
  { value: 'ready', label: 'Ready' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_PRESENTATION: Record<
  InvoicePdfStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info' }
> = {
  ready: { label: 'Ready', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  processing: { label: 'Preparing', variant: 'info' },
  failed: { label: 'Needs retry', variant: 'danger' },
};

const startOfLocalDayIso = (date: string): string | undefined => {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00`).toISOString();
};

const endOfLocalDayIso = (date: string): string | undefined => {
  if (!date) return undefined;
  return new Date(`${date}T23:59:59.999`).toISOString();
};

export const InvoiceHistory: React.FC<{ shopId: string }> = ({ shopId }) => {
  const queryClient = useQueryClient();
  const [filters, setFilters] = React.useState<InvoiceFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = React.useState<InvoiceFilters>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [downloadError, setDownloadError] = React.useState('');
  const queryParams = {
    page,
    limit: 25,
    search: appliedFilters.search || undefined,
    from_date: startOfLocalDayIso(appliedFilters.fromDate),
    to_date: endOfLocalDayIso(appliedFilters.toDate),
    pdf_status: appliedFilters.pdfStatus || undefined,
  };
  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices(shopId, queryParams),
    queryFn: () => apiClient.listInvoices(queryParams),
    enabled: Boolean(shopId),
  });

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const downloadInvoice = async (invoice: InvoiceSummary) => {
    setDownloadingId(invoice.sale_id);
    setDownloadError('');
    try {
      const download = await apiClient.getInvoiceDownload(invoice.sale_id);
      await downloadUrl(download.url, `${invoice.invoice_no}.pdf`);
      await queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'invoices'] });
    } catch (caught) {
      setDownloadError(
        caught instanceof Error ? caught.message : 'Unable to download this invoice',
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const invoices = invoicesQuery.data?.invoices ?? [];
  const pageCount = invoicesQuery.data?.pages ?? 0;

  return (
    <div
      id="invoice-history-panel"
      role="tabpanel"
      aria-labelledby="invoice-history-tab"
      className="space-y-5"
    >
      <Card className="p-5 sm:p-6">
        <form onSubmit={applyFilters} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="md:col-span-2">
              <Input
                id="invoice-search"
                label="Search invoices"
                placeholder="Invoice number, customer, or phone"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))}
              />
            </div>
            <Input
              id="invoice-from-date"
              label="From"
              type="date"
              value={filters.fromDate}
              onChange={(event) => setFilters((current) => ({
                ...current,
                fromDate: event.target.value,
              }))}
            />
            <Input
              id="invoice-to-date"
              label="To"
              type="date"
              min={filters.fromDate || undefined}
              value={filters.toDate}
              onChange={(event) => setFilters((current) => ({
                ...current,
                toDate: event.target.value,
              }))}
            />
            <Select
              id="invoice-status"
              label="PDF status"
              value={filters.pdfStatus}
              options={STATUS_OPTIONS}
              placeholder="All statuses"
              onChange={(event) => setFilters((current) => ({
                ...current,
                pdfStatus: event.target.value as InvoiceFilters['pdfStatus'],
              }))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">
              <Search className="h-4 w-4" />
              <span>Search</span>
            </Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {downloadError ? <Alert type="error" message={downloadError} /> : null}
      {invoicesQuery.error instanceof Error ? (
        <Alert type="error" message={invoicesQuery.error.message} />
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Invoice history</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {invoicesQuery.data?.total ?? 0} invoices in this shop
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={invoicesQuery.isFetching}
            onClick={() => void invoicesQuery.refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${invoicesQuery.isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>

        {invoicesQuery.isPending ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" />
            <h3 className="mt-4 font-bold text-slate-800 dark:text-slate-200">
              No invoices found
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Completed sales will appear here as their invoices are prepared.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-bold">Invoice</th>
                  <th className="px-5 py-3 font-bold">Customer</th>
                  <th className="px-5 py-3 font-bold">Date</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 font-bold">Status</th>
                  <th className="px-5 py-3 text-right font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((invoice) => {
                  const status = STATUS_PRESENTATION[invoice.pdf_status];
                  const isDownloading = downloadingId === invoice.sale_id;
                  return (
                    <tr
                      key={invoice.sale_id}
                      className="bg-white transition-colors hover:bg-slate-50/70 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                        {invoice.invoice_no}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {invoice.customer_name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {invoice.customer_phone}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-slate-400" />
                          {formatDate(invoice.created_at)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-slate-900 dark:text-white">
                        {formatCurrency(invoice.total_amount)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={invoice.pdf_status === 'failed' ? 'secondary' : 'primary'}
                          isLoading={isDownloading}
                          disabled={downloadingId !== null}
                          aria-label={`${invoice.pdf_status === 'failed' ? 'Retry' : 'Download'} ${invoice.invoice_no}`}
                          onClick={() => void downloadInvoice(invoice)}
                        >
                          {invoice.pdf_status === 'failed' ? (
                            <RefreshCw className="h-4 w-4" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                          <span>{invoice.pdf_status === 'failed' ? 'Retry' : 'Download'}</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Previous</span>
            </Button>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              Page {page} of {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
};

export const InvoiceSettings: React.FC<{ shopId: string }> = ({ shopId }) => {
  const { reload } = useShop();
  const [profile, setProfile] = React.useState<ShopProfile>(EMPTY_PROFILE);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const shopsQuery = useQuery({
    queryKey: ['shops', shopId, 'invoice-settings'],
    queryFn: apiClient.listShops,
  });
  const selectedShop = shopsQuery.data?.find(({ id }) => id === shopId);

  React.useEffect(() => {
    if (!selectedShop) return;
    setProfile({
      name: selectedShop.name,
      legal_name: selectedShop.legal_name ?? selectedShop.name,
      tax_id: selectedShop.tax_id ?? '',
      address: selectedShop.address ?? '',
      state: selectedShop.state ?? '',
      state_code: selectedShop.state_code ?? '',
      invoice_prefix: selectedShop.invoice_prefix ?? 'INV',
      tax_rate_percent: String(selectedShop.tax_rate_percent),
    });
  }, [selectedShop]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.updateShop(shopId, {
        ...profile,
        tax_rate_percent: Number(profile.tax_rate_percent),
      });
      await Promise.all([reload(), shopsQuery.refetch()]);
      setMessage('Invoice settings updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update invoice settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      id="invoice-settings-panel"
      role="tabpanel"
      aria-labelledby="invoice-settings-tab"
      className="space-y-5"
    >
      {error ? <Alert type="error" message={error} /> : null}
      {message ? <Alert type="success" message={message} /> : null}
      {shopsQuery.error instanceof Error ? (
        <Alert type="error" message={shopsQuery.error.message} />
      ) : null}
      <Card className="p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Invoice identity
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            These values are snapshotted onto each sale so issued invoices never change later.
          </p>
        </div>
        {shopsQuery.isPending ? (
          <div className="flex justify-center py-12"><Loader /></div>
        ) : (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfile}>
            {([
              ['name', 'Shop display name'],
              ['legal_name', 'Legal business name'],
              ['tax_id', 'Tax ID / GSTIN'],
              ['invoice_prefix', 'Invoice prefix'],
              ['tax_rate_percent', 'GST rate (%)'],
              ['state', 'State'],
              ['state_code', 'State code'],
            ] as const).map(([field, label]) => (
              <Input
                key={field}
                id={`invoice-${field}`}
                label={label}
                required={field !== 'tax_id'}
                type={field === 'tax_rate_percent' ? 'number' : 'text'}
                min={field === 'tax_rate_percent' ? 0 : undefined}
                max={field === 'tax_rate_percent' ? 100 : undefined}
                step={field === 'tax_rate_percent' ? '0.01' : undefined}
                value={profile[field]}
                onChange={(event) => setProfile((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))}
              />
            ))}
            <label
              htmlFor="invoice-address"
              className="block text-sm font-medium text-slate-700 sm:col-span-2 dark:text-slate-300"
            >
              Business address
              <textarea
                id="invoice-address"
                required
                value={profile.address}
                onChange={(event) => setProfile((current) => ({
                  ...current,
                  address: event.target.value,
                }))}
                className="ui-input mt-1 min-h-28"
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" isLoading={busy}>Save invoice settings</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
};
