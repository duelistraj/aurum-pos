import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  MessageCircle,
  Phone,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  ListboxSelect,
  Loader,
  Modal,
} from '../components/UI';
import { useShop } from '../context/ShopContext';
import type { InvoicePdfStatus, InvoiceSummary } from '../types';
import { downloadUrl, formatCurrency, formatDate, printInvoicePdf } from '../utils';
import {
  acceptIndianPhoneInput,
  INDIAN_PHONE_ERROR,
  isValidIndianPhone,
} from '../utils/phone';

interface InvoiceFilters {
  search: string;
  fromDate: string;
  toDate: string;
  pdfStatus: '' | InvoicePdfStatus;
}

interface InvoiceCursor {
  createdAt: string;
  id: string;
}

interface ShopProfile {
  name: string;
  legal_name: string;
  tax_id: string;
  phone: string;
  address: string;
  state: string;
  state_code: string;
  invoice_prefix: string;
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
  phone: '',
  address: '',
  state: '',
  state_code: '',
  invoice_prefix: 'INV',
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

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`relative inline-block ${className}`} aria-hidden="true">
    <MessageCircle className="absolute inset-0 h-full w-full" />
    <Phone className="absolute left-1/4 top-1/4 h-1/2 w-1/2 fill-current stroke-[2.5]" />
  </span>
);

export const InvoiceHistory: React.FC<{ shopId: string }> = ({ shopId }) => {
  const queryClient = useQueryClient();
  const { activeMembership } = useShop();
  const [filters, setFilters] = React.useState<InvoiceFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = React.useState<InvoiceFilters>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);
  const [cursorByPage, setCursorByPage] = React.useState<Record<number, InvoiceCursor>>({});
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [printingId, setPrintingId] = React.useState<string | null>(null);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [whatsAppInvoice, setWhatsAppInvoice] = React.useState<InvoiceSummary | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = React.useState<string | null>(null);
  const [downloadError, setDownloadError] = React.useState('');
  const queryParams = {
    page,
    limit: 25,
    search: appliedFilters.search || undefined,
    from_date: startOfLocalDayIso(appliedFilters.fromDate),
    to_date: endOfLocalDayIso(appliedFilters.toDate),
    pdf_status: appliedFilters.pdfStatus || undefined,
    cursor_created_at: cursorByPage[page]?.createdAt,
    cursor_id: cursorByPage[page]?.id,
  };
  const invoicesQuery = useQuery({
    queryKey: queryKeys.invoices(shopId, queryParams),
    queryFn: () => apiClient.listInvoices(queryParams),
    enabled: Boolean(shopId),
  });
  const whatsAppCapability = useQuery({
    queryKey: ['shops', shopId, 'whatsapp', 'capability'],
    queryFn: () => apiClient.getWhatsAppCapability(),
    enabled: Boolean(shopId),
    staleTime: 60_000,
  });

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setPage(1);
    setCursorByPage({});
    setExpandedInvoiceId(null);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
    setCursorByPage({});
    setExpandedInvoiceId(null);
  };

  React.useEffect(() => {
    setExpandedInvoiceId(null);
  }, [shopId]);

  const toggleExpandedInvoice = (saleId: string) => {
    setExpandedInvoiceId((current) => current === saleId ? null : saleId);
  };

  const handleMobileRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    saleId: string,
  ) => {
    if (window.matchMedia?.('(min-width: 640px)').matches) return;
    if ((event.target as HTMLElement).closest('button, input, a')) return;
    toggleExpandedInvoice(saleId);
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

  const printInvoice = async (invoice: InvoiceSummary) => {
    setPrintingId(invoice.sale_id);
    setDownloadError('');
    try {
      const pdf = await apiClient.getInvoicePdf(invoice.sale_id);
      await printInvoicePdf(pdf, `${invoice.invoice_no}.pdf`);
    } catch (caught) {
      setDownloadError(
        caught instanceof Error ? caught.message : 'Unable to print this invoice',
      );
    } finally {
      setPrintingId(null);
    }
  };

  const confirmWhatsAppDelivery = async () => {
    if (!whatsAppInvoice) return;
    setSendingId(whatsAppInvoice.sale_id);
    setDownloadError('');
    try {
      const idempotencyKey = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `whatsapp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await apiClient.sendInvoiceToWhatsApp(
        whatsAppInvoice.sale_id,
        {
          confirm_customer_request: true,
          recipient_phone: whatsAppInvoice.customer_phone,
          resend: Boolean(whatsAppInvoice.whatsapp_delivery_status),
        },
        idempotencyKey,
      );
      setWhatsAppInvoice(null);
      await queryClient.invalidateQueries({ queryKey: ['shops', shopId, 'invoices'] });
    } catch (caught) {
      setDownloadError(
        caught instanceof Error ? caught.message : 'Unable to send this invoice on WhatsApp',
      );
    } finally {
      setSendingId(null);
    }
  };

  const invoiceActions = (invoice: InvoiceSummary, mobile = false) => {
    const isDownloading = downloadingId === invoice.sale_id;
    const isPrinting = printingId === invoice.sale_id;
    const isSending = sendingId === invoice.sale_id;
    const isPdfReady = invoice.pdf_status === 'ready';
    const actionClass = 'h-11 w-11 p-0';
    return (
      <div className={`flex items-center ${mobile ? 'justify-start' : 'justify-end'} gap-2`}>
        <Button
          type="button"
          size="sm"
          className={actionClass}
          variant={invoice.pdf_status === 'failed' ? 'secondary' : 'primary'}
          disabled={downloadingId !== null}
          title={invoice.pdf_status === 'failed' ? 'Retry invoice' : 'Download invoice'}
          aria-label={`${invoice.pdf_status === 'failed' ? 'Retry' : 'Download'} ${invoice.invoice_no}${mobile ? ' from details' : ''}`}
          onClick={() => void downloadInvoice(invoice)}
        >
          {isDownloading || invoice.pdf_status === 'failed' ? (
            <RefreshCw className={`h-5 w-5 ${isDownloading ? 'animate-spin' : ''}`} />
          ) : (
            <Download className="h-5 w-5" />
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          className={actionClass}
          variant="secondary"
          disabled={!isPdfReady || printingId !== null}
          title="Print invoice"
          aria-label={`Print ${invoice.invoice_no}${mobile ? ' from details' : ''}`}
          onClick={() => void printInvoice(invoice)}
        >
          {isPrinting ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : (
            <Printer className="h-5 w-5" />
          )}
        </Button>
        {whatsAppCapability.data?.enabled ? (
          <Button
            type="button"
            size="sm"
            className={actionClass}
            variant="secondary"
            disabled={!whatsAppCapability.data.available || sendingId !== null}
            title={whatsAppCapability.data.available
              ? 'Send invoice on WhatsApp'
              : 'WhatsApp invoice delivery requires Pro'}
            aria-label={`WhatsApp ${invoice.invoice_no}${mobile ? ' from details' : ''}`}
            onClick={() => {
              setDownloadError('');
              setWhatsAppInvoice(invoice);
            }}
          >
            {isSending ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <WhatsAppIcon className="h-5 w-5" />
            )}
          </Button>
        ) : null}
      </div>
    );
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
            <ListboxSelect
              id="invoice-status"
              label="PDF status"
              value={filters.pdfStatus}
              options={STATUS_OPTIONS}
              placeholder="All statuses"
              onValueChange={(value) => setFilters((current) => ({
                ...current,
                pdfStatus: value as InvoiceFilters['pdfStatus'],
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
            <table className="invoice-table w-full table-fixed text-left sm:min-w-[820px] sm:table-auto">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="w-[7.5rem] px-2 py-3 text-[0.65rem] font-bold sm:w-auto sm:px-5 sm:text-xs">Invoice</th>
                  <th className="hidden px-5 py-3 font-bold sm:table-cell">Customer</th>
                  <th className="hidden px-5 py-3 font-bold sm:table-cell">Date</th>
                  <th className="w-[5.5rem] px-2 py-3 text-right text-[0.65rem] font-bold sm:w-auto sm:px-5 sm:text-xs">Amount</th>
                  <th className="w-[5.5rem] px-2 py-3 text-[0.65rem] font-bold sm:w-auto sm:px-5 sm:text-xs">Status</th>
                  <th className="hidden px-5 py-3 text-right font-bold sm:table-cell">Action</th>
                  <th className="w-11 px-1 py-3 sm:hidden">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((invoice) => {
                  const status = STATUS_PRESENTATION[invoice.pdf_status];
                  const isExpanded = expandedInvoiceId === invoice.sale_id;
                  const detailsId = `invoice-details-${invoice.sale_id}`;
                  return (
                    <React.Fragment key={invoice.sale_id}>
                      <tr
                        onClick={(event) => handleMobileRowClick(event, invoice.sale_id)}
                        className="bg-white transition-colors hover:bg-slate-50/70 max-sm:cursor-pointer dark:bg-slate-900 dark:hover:bg-slate-800/50"
                      >
                        <td className="min-w-0 px-2 py-3 font-bold text-slate-900 dark:text-white sm:px-5 sm:py-4">
                          <span title={invoice.invoice_no} className="block truncate text-xs sm:text-sm">
                            {invoice.invoice_no}
                          </span>
                        </td>
                        <td className="hidden px-5 py-4 sm:table-cell">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {invoice.customer_name}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {invoice.customer_phone}
                          </p>
                        </td>
                        <td className="hidden px-5 py-4 text-sm text-slate-600 dark:text-slate-300 sm:table-cell">
                          <span className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-slate-400" />
                            {formatDate(invoice.created_at)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right text-xs font-bold text-slate-900 dark:text-white sm:px-5 sm:py-4 sm:text-sm">
                          {formatCurrency(invoice.total_amount)}
                        </td>
                        <td className="px-2 py-3 sm:px-5 sm:py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge variant={status.variant}>{status.label}</Badge>
                            {invoice.whatsapp_delivery_status ? (
                              <Badge variant="info">
                                WhatsApp: {invoice.whatsapp_delivery_status}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="hidden px-5 py-4 text-right sm:table-cell">
                          {invoiceActions(invoice)}
                        </td>
                        <td className="px-1 py-2 sm:hidden">
                          <button
                            type="button"
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            aria-label={`${isExpanded ? 'Hide' : 'Show'} details for ${invoice.invoice_no}`}
                            onClick={() => toggleExpandedInvoice(invoice.sale_id)}
                            className="flex h-11 w-11 items-center justify-center rounded-app-control text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            <ChevronDown
                              aria-hidden="true"
                              className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr id={detailsId} className="bg-slate-50/60 dark:bg-slate-950/40 sm:hidden">
                          <td colSpan={4} className="px-3 pb-4 pt-2">
                            <div className="grid grid-cols-2 gap-3 rounded-app-inset border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                              <div className="col-span-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                  Invoice
                                </p>
                                <p className="mt-1 break-all text-sm font-bold text-slate-900 dark:text-white">
                                  {invoice.invoice_no}
                                </p>
                              </div>
                              <div className="col-span-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                  Customer
                                </p>
                                <p className="mt-1 break-words text-sm font-bold text-slate-900 dark:text-white">
                                  {invoice.customer_name}
                                </p>
                                <p className="mt-0.5 break-all text-sm text-slate-500 dark:text-slate-400">
                                  {invoice.customer_phone}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                  Date
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                  {formatDate(invoice.created_at)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                  Total
                                </p>
                                <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                                  {formatCurrency(invoice.total_amount)}
                                </p>
                              </div>
                              <div className="col-span-2">
                                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                                  PDF status
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant={status.variant}>{status.label}</Badge>
                                  {invoice.whatsapp_delivery_status ? (
                                    <Badge variant="info">
                                      WhatsApp: {invoice.whatsapp_delivery_status}
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                              <div className="col-span-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                                {invoiceActions(invoice, true)}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
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
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                setExpandedInvoiceId(null);
              }}
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
              onClick={() => {
                const createdAt = invoicesQuery.data?.next_cursor_created_at;
                const id = invoicesQuery.data?.next_cursor_id;
                if (!createdAt || !id) return;
                setCursorByPage((current) => ({
                  ...current,
                  [page + 1]: { createdAt, id },
                }));
                setPage((current) => current + 1);
                setExpandedInvoiceId(null);
              }}
            >
              <span>Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </Card>
      <Modal
        isOpen={whatsAppInvoice !== null}
        title="Send invoice on WhatsApp"
        size="md"
        onClose={() => setWhatsAppInvoice(null)}
        footer={(
          <>
            <Button type="button" variant="secondary" onClick={() => setWhatsAppInvoice(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={sendingId !== null}
              onClick={() => void confirmWhatsAppDelivery()}
            >
              Confirm and send
            </Button>
          </>
        )}
      >
        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          {downloadError ? <Alert type="error" message={downloadError} /> : null}
          <p>
            The customer requested delivery to <strong>{whatsAppInvoice?.customer_phone}</strong>.
          </p>
          <p>
            Aurum POS will send it on behalf of {activeMembership?.shop_name ?? 'this store'}.
          </p>
          <p>
            It will come from Aurum's shared WhatsApp number, so invoices from other Aurum stores
            may appear in the same customer conversation.
          </p>
          {whatsAppInvoice?.whatsapp_delivery_status ? (
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              This invoice has already been queued or sent. Confirming will send it again.
            </p>
          ) : null}
        </div>
      </Modal>
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
      phone: selectedShop.phone ?? '',
      address: selectedShop.address ?? '',
      state: selectedShop.state ?? '',
      state_code: selectedShop.state_code ?? '',
      invoice_prefix: selectedShop.invoice_prefix ?? 'INV',
    });
  }, [selectedShop]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profile.phone && !isValidIndianPhone(profile.phone)) {
      setMessage('');
      setError(INDIAN_PHONE_ERROR);
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiClient.updateShop(shopId, profile);
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
              ['phone', 'Shop phone number'],
              ['invoice_prefix', 'Invoice prefix'],
              ['state', 'State'],
              ['state_code', 'State code'],
            ] as const).map(([field, label]) => (
              <Input
                key={field}
                id={`invoice-${field}`}
                label={label}
                required={field !== 'tax_id' && field !== 'phone'}
                type={field === 'phone' ? 'tel' : 'text'}
                inputMode={field === 'phone' ? 'numeric' : undefined}
                maxLength={field === 'phone' ? 10 : undefined}
                pattern={field === 'phone' ? '[0-9]{10}' : undefined}
                error={field === 'phone' && profile.phone && !isValidIndianPhone(profile.phone)
                  ? INDIAN_PHONE_ERROR
                  : undefined}
                value={profile[field]}
                onChange={(event) => setProfile((current) => ({
                  ...current,
                  [field]: field === 'phone'
                    ? acceptIndianPhoneInput(current.phone, event.target.value)
                    : event.target.value,
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
