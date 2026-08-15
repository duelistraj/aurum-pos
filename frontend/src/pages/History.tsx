import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Archive,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Coins,
  FileText,
  IndianRupee,
  PackagePlus,
  Pencil,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import { Button, Card, Input, ListboxSelect, Loader } from '../components/UI';
import { TablePagination } from '../components/TablePagination';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useShop } from '../context/ShopContext';
import type {
  AuditLogEntry,
  AuditLogPage,
  SoldTransactionPage,
} from '../types';
import { formatCurrency, formatDate } from '../utils';
import { InvoiceHistory } from './Invoices';

type TransactionTab = 'activity' | 'invoices';

interface AuditFilters {
  search: string;
  eventType: string;
  actorUserId: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_AUDIT_FILTERS: AuditFilters = {
  search: '',
  eventType: '',
  actorUserId: '',
  fromDate: '',
  toDate: '',
};

const EVENT_OPTIONS = [
  { value: 'inventory.item_created', label: 'Item created' },
  { value: 'inventory.item_updated', label: 'Item updated' },
  { value: 'inventory.item_archived', label: 'Item archived' },
  { value: 'sales.sale_completed', label: 'Sale completed' },
  { value: 'rates.rate_created', label: 'Rate created' },
  { value: 'rates.rate_updated', label: 'Rate updated' },
  { value: 'shop.settings_updated', label: 'Shop settings updated' },
  { value: 'team.invitation_issued', label: 'Invitation issued' },
  { value: 'team.invitation_accepted', label: 'Invitation accepted' },
  { value: 'team.member_updated', label: 'Member updated' },
  { value: 'team.ownership_transfer', label: 'Ownership transfer' },
];

const EVENT_META: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}> = {
  'inventory.item_created': {
    label: 'Item created',
    icon: PackagePlus,
    tone: 'audit-event--green',
  },
  'inventory.item_updated': {
    label: 'Item updated',
    icon: Pencil,
    tone: 'audit-event--blue',
  },
  'inventory.item_archived': {
    label: 'Item archived',
    icon: Archive,
    tone: 'audit-event--red',
  },
  'sales.sale_completed': {
    label: 'Sale completed',
    icon: IndianRupee,
    tone: 'audit-event--gold',
  },
  'rates.rate_created': {
    label: 'Rate created',
    icon: Coins,
    tone: 'audit-event--violet',
  },
  'rates.rate_updated': {
    label: 'Rate updated',
    icon: Coins,
    tone: 'audit-event--violet',
  },
  'shop.settings_updated': {
    label: 'Shop updated',
    icon: Settings,
    tone: 'audit-event--slate',
  },
  'team.invitation_issued': {
    label: 'Invitation issued',
    icon: Users,
    tone: 'audit-event--blue',
  },
  'team.invitation_accepted': {
    label: 'Invitation accepted',
    icon: CheckCircle2,
    tone: 'audit-event--green',
  },
  'team.member_updated': {
    label: 'Member updated',
    icon: Users,
    tone: 'audit-event--blue',
  },
  'team.ownership_transfer_requested': {
    label: 'Transfer requested',
    icon: ArrowLeftRight,
    tone: 'audit-event--gold',
  },
  'team.ownership_transfer_completed': {
    label: 'Transfer completed',
    icon: ArrowLeftRight,
    tone: 'audit-event--green',
  },
};

const titleCase = (value: string) =>
  value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());

const formatAuditValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString('en-IN');
  if (Array.isArray(value)) return value.map(formatAuditValue).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => `${titleCase(key.replace(/_/g, ' '))}: ${formatAuditValue(nestedValue)}`)
      .join(', ');
  }
  return String(value);
};

const startOfLocalDayIso = (value: string): string | undefined =>
  value ? new Date(`${value}T00:00:00`).toISOString() : undefined;

const endOfLocalDayIso = (value: string): string | undefined =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

const formatTime = (value: string): string => new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const AuditDetails: React.FC<{ entry: AuditLogEntry }> = ({ entry }) => {
  const { details } = entry;
  return (
    <div className="audit-details">
      <dl className="audit-details__mobile-meta sm:hidden">
        <div>
          <dt>Reference</dt>
          <dd>{entry.subject.reference || 'Not available'}</dd>
        </div>
        <div>
          <dt>Performed by</dt>
          <dd>
            {entry.actor.name}
            {entry.actor.role ? ` · ${titleCase(entry.actor.role)}` : ''}
          </dd>
        </div>
      </dl>

      {details.kind === 'changes' ? (
        <div className="overflow-x-auto">
          <table className="audit-details__table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Previous value</th>
                <th>New value</th>
              </tr>
            </thead>
            <tbody>
              {details.changes.map((change) => (
                <tr key={change.field}>
                  <th scope="row">{change.label}</th>
                  <td>{formatAuditValue(change.before)}</td>
                  <td>{formatAuditValue(change.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {details.kind === 'sale' ? (
        <div className="space-y-3">
          <div className="audit-details__sale-heading">
            <span>Sold items</span>
            {details.total !== null ? <strong>{formatCurrency(details.total)}</strong> : null}
          </div>
          {details.sale_items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="audit-details__table audit-details__table--sale">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Barcode</th>
                    <th>Sold</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {details.sale_items.map((item) => (
                    <tr key={item.item_id}>
                      <th scope="row">
                        {item.name}
                        {item.sku ? <small>{item.sku}</small> : null}
                      </th>
                      <td data-label="Barcode">{item.barcode || 'Not available'}</td>
                      <td data-label="Sold">
                        {item.weight_grams && item.weight_grams > 0
                          ? `${item.weight_grams.toLocaleString('en-IN')} gram`
                          : `${item.quantity ?? 0} ${(item.quantity ?? 0) === 1 ? 'piece' : 'pieces'}`}
                      </td>
                      <td data-label="Amount" className="text-right font-semibold">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="audit-details__empty">No item-level details are available for this historical sale.</p>
          )}
        </div>
      ) : null}

      {details.kind === 'facts' ? (
        details.facts.length > 0 ? (
          <dl className="audit-facts">
            {details.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{formatAuditValue(fact.value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="audit-details__empty">No additional details were recorded.</p>
        )
      ) : null}
    </div>
  );
};

const AuditLogTable: React.FC = () => {
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const [filters, setFilters] = React.useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const actorsQuery = useQuery({
    queryKey: queryKeys.auditActors(shopId),
    queryFn: () => apiClient.getAuditActorOptions(),
    enabled: Boolean(shopId),
  });
  const auditQuery = useQuery<AuditLogPage>({
    queryKey: queryKeys.history(shopId, {
      ...filters,
      search: debouncedSearch,
      page,
      rowsPerPage,
    }),
    queryFn: () => apiClient.getChangeLogHistory({
      search: debouncedSearch || undefined,
      event_type: filters.eventType || undefined,
      actor_user_id: filters.actorUserId || undefined,
      from_date: startOfLocalDayIso(filters.fromDate),
      to_date: endOfLocalDayIso(filters.toDate),
      page,
      limit: rowsPerPage,
    }),
    enabled: Boolean(shopId),
    placeholderData: (previous) => previous,
  });

  React.useEffect(() => {
    setExpandedId(null);
    setPage(1);
  }, [shopId]);

  const updateFilters = (update: (current: AuditFilters) => AuditFilters) => {
    setFilters(update);
    setExpandedId(null);
    setPage(1);
  };

  const entries = auditQuery.data?.entries ?? [];
  return (
    <div
      id="transaction-activity-panel"
      role="tabpanel"
      aria-labelledby="transaction-activity-tab"
      className="space-y-5"
    >
      <Card className="p-5 sm:p-6">
        <div className="transaction-filter-layout audit-filter-layout">
          <div className="transaction-filter-search">
              <Input
                id="audit-search"
                label="Record or reference"
                placeholder="Search barcode, SKU, item, or invoice"
                value={filters.search}
                onChange={(event) => updateFilters((current) => ({
                  ...current,
                  search: event.target.value,
                }))}
              />
          </div>
          <ListboxSelect
              id="audit-event-filter"
              label="Event type"
              className="transaction-filter-event"
              placeholder="All events"
              options={EVENT_OPTIONS}
              value={filters.eventType}
              onValueChange={(eventType) => updateFilters((current) => ({
                ...current,
                eventType,
              }))}
            />
          <ListboxSelect
              id="audit-actor-filter"
              label="Performed by"
              className="transaction-filter-actor"
              placeholder="Everyone"
              options={(actorsQuery.data ?? []).map((actor) => ({
                value: actor.user_id,
                label: actor.role ? `${actor.name} · ${titleCase(actor.role)}` : actor.name,
              }))}
              value={filters.actorUserId}
              onValueChange={(actorUserId) => updateFilters((current) => ({
                ...current,
                actorUserId,
              }))}
            />
          <Input
            id="audit-from-date"
            label="From date"
            type="date"
            wrapperClassName="transaction-filter-from"
            value={filters.fromDate}
            onChange={(event) => {
              const fromDate = event.target.value;
              updateFilters((current) => ({
                ...current,
                fromDate,
                toDate: current.toDate && current.toDate < fromDate ? '' : current.toDate,
              }));
            }}
          />
          <Input
            id="audit-to-date"
            label="To date"
            type="date"
            wrapperClassName="transaction-filter-to"
            min={filters.fromDate || undefined}
            value={filters.toDate}
            onChange={(event) => updateFilters((current) => ({
              ...current,
              toDate: event.target.value,
            }))}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {auditQuery.isPending ? (
          <div className="flex justify-center py-16"><Loader /></div>
        ) : auditQuery.isError ? (
          <div className="table-empty-state" role="alert">
            <Activity />
            <h3>Audit log could not be loaded</h3>
            <p>{auditQuery.error.message}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="table-empty-state">
            <ShieldCheck />
            <h3>No audit events found</h3>
            <p>Try adjusting the selected search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="audit-table w-full table-fixed text-left sm:min-w-[980px] sm:table-auto">
              <thead>
                <tr>
                  <th className="w-[6.5rem] sm:w-auto">Date and time</th>
                  <th className="audit-table__event-cell">Event</th>
                  <th>Record</th>
                  <th className="hidden sm:table-cell">Reference</th>
                  <th className="hidden sm:table-cell">Performed by</th>
                  <th className="w-11 sm:w-auto"><span className="sr-only sm:not-sr-only">Summary</span></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const expanded = expandedId === entry.id;
                  const meta = EVENT_META[entry.event_type] ?? {
                    label: entry.event_type,
                    icon: Activity,
                    tone: 'audit-event--slate',
                  };
                  const EventIcon = meta.icon;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className={`audit-table__row ${expanded ? 'is-expanded' : ''}`}
                        onClick={() => setExpandedId(expanded ? null : entry.id)}
                      >
                        <td className="audit-table__date">{formatDate(entry.created_at)}</td>
                        <td className="audit-table__event-cell">
                          <span className={`audit-event ${meta.tone}`}>
                            <EventIcon />
                            <span>{meta.label}</span>
                          </span>
                        </td>
                        <td>
                          <strong className="audit-table__record">{entry.subject.label}</strong>
                          <small>{entry.area}</small>
                        </td>
                        <td className="hidden font-mono text-sm sm:table-cell">
                          {entry.subject.reference || 'Not available'}
                        </td>
                        <td className="hidden sm:table-cell">
                          <strong className="audit-table__actor">{entry.actor.name}</strong>
                          <small>{entry.actor.role ? titleCase(entry.actor.role) : titleCase(entry.actor.kind)}</small>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="audit-table__disclosure"
                            aria-expanded={expanded}
                            aria-controls={`audit-details-${entry.id}`}
                            aria-label={`${expanded ? 'Hide' : 'Show'} details for ${entry.subject.label}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedId(expanded ? null : entry.id);
                            }}
                          >
                            <span className="hidden sm:inline">{entry.summary}</span>
                            <ChevronDown className={expanded ? 'is-expanded' : ''} />
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr id={`audit-details-${entry.id}`} className="audit-table__details-row">
                          <td colSpan={6}><AuditDetails entry={entry} /></td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {(!auditQuery.isPending || entries.length > 0) ? (
        <TablePagination
          currentPage={page}
          totalPages={auditQuery.data?.pages ?? 0}
          totalItems={auditQuery.data?.total ?? 0}
          rowsPerPage={rowsPerPage}
          itemLabel="events"
          loading={auditQuery.isFetching}
          onPageChange={(nextPage) => {
            setExpandedId(null);
            setPage(nextPage);
          }}
          onRowsPerPageChange={(rows) => {
            setRowsPerPage(rows);
            setExpandedId(null);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
};

const SoldItemsTable: React.FC = () => {
  const { activeMembership } = useShop();
  const shopId = activeMembership?.shop_id ?? '';
  const [search, setSearch] = React.useState('');
  const [appliedSearch, setAppliedSearch] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const soldQuery = useQuery<SoldTransactionPage>({
    queryKey: queryKeys.cashierSoldHistory(shopId, { search: appliedSearch, page, rowsPerPage }),
    queryFn: () => apiClient.getCashierSoldHistory({
      search: appliedSearch || undefined,
      page,
      limit: rowsPerPage,
    }),
    enabled: Boolean(shopId),
  });
  const entries = soldQuery.data?.entries ?? [];

  React.useEffect(() => {
    setPage(1);
  }, [shopId]);

  return (
    <div
      id="transaction-activity-panel"
      role="tabpanel"
      aria-labelledby="transaction-activity-tab"
      className="space-y-5"
    >
      <Card className="p-5 sm:p-6">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
            setPage(1);
          }}
        >
          <div className="flex-1">
            <Input
              id="sold-items-search"
              label="Item or reference"
              placeholder="Search item, SKU, barcode, or invoice"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSearch('');
              setAppliedSearch('');
              setPage(1);
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button type="submit" variant="primary">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="table-card-heading">
          <div>
            <h2>Sold items today</h2>
            <p>{soldQuery.data?.total ?? 0} items sold during the current shop day</p>
          </div>
          <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        </div>

        {soldQuery.isPending ? (
          <div className="flex justify-center py-16"><Loader /></div>
        ) : soldQuery.isError ? (
          <div className="table-empty-state" role="alert">
            <ShoppingBag />
            <h3>Sold items could not be loaded</h3>
            <p>{soldQuery.error.message}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="table-empty-state">
            <ShoppingBag />
            <h3>No sold items found today</h3>
            <p>Completed sales from today will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="sold-items-table w-full min-w-[760px] text-left">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Invoice</th>
                  <th>Item</th>
                  <th>Barcode</th>
                  <th>Sold</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatTime(entry.created_at)}</td>
                    <td className="font-mono">{entry.invoice_no || 'Not available'}</td>
                    <td>
                      <strong>{entry.item_name}</strong>
                      {entry.sku ? <small>{entry.sku}</small> : null}
                    </td>
                    <td className="font-mono">{entry.barcode || 'Not available'}</td>
                    <td className="whitespace-nowrap">
                      {entry.weight_grams && entry.weight_grams > 0
                        ? `${entry.weight_grams.toLocaleString('en-IN')} gram`
                        : `${entry.quantity ?? 0} ${(entry.quantity ?? 0) === 1 ? 'piece' : 'pieces'}`}
                    </td>
                    <td className="text-right font-semibold">{formatCurrency(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {(!soldQuery.isPending || entries.length > 0) ? (
        <TablePagination
          currentPage={page}
          totalPages={soldQuery.data?.pages ?? 0}
          totalItems={soldQuery.data?.total ?? 0}
          rowsPerPage={rowsPerPage}
          itemLabel="sold items"
          loading={soldQuery.isFetching}
          onPageChange={setPage}
          onRowsPerPageChange={(rows) => {
            setRowsPerPage(rows);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
};

export const Transactions: React.FC = () => {
  const { activeMembership } = useShop();
  const [searchParams, setSearchParams] = useSearchParams();
  const activityTabRef = React.useRef<HTMLButtonElement>(null);
  const invoicesTabRef = React.useRef<HTMLButtonElement>(null);
  const isCashier = activeMembership?.role === 'CASHIER';
  const activeTab: TransactionTab = searchParams.get('tab') === 'invoices'
    ? 'invoices'
    : 'activity';

  const selectTab = (tab: TransactionTab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'activity') nextParams.delete('tab');
    else nextParams.set('tab', tab);
    setSearchParams(nextParams);
  };

  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tab: TransactionTab,
  ) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const nextTab = tab === 'activity' ? 'invoices' : 'activity';
    selectTab(nextTab);
    window.requestAnimationFrame(() => {
      (nextTab === 'activity' ? activityTabRef : invoicesTabRef).current?.focus();
    });
  };

  const activityLabel = isCashier ? 'Sold Items' : 'Audit Log';
  return (
    <div className="app-page min-h-screen bg-transparent text-slate-800 transition-colors duration-200 dark:text-slate-100">
      <div className="app-page__container mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="app-page__header app-page__header--stacked mb-6 animate-slide-down">
          <h1>Transactions</h1>
          <p>
            {isCashier
              ? "Review today's sold items or work with issued invoices."
              : 'Review accountable shop changes or work with issued invoices.'}
          </p>
        </div>

        <div className="app-segmented-control mb-5" role="tablist" aria-label="Transaction sections">
          <button
            ref={activityTabRef}
            id="transaction-activity-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'activity'}
            aria-controls="transaction-activity-panel"
            tabIndex={activeTab === 'activity' ? 0 : -1}
            className={`app-segmented-control__tab ${activeTab === 'activity' ? 'is-active' : ''}`}
            onClick={() => selectTab('activity')}
            onKeyDown={(event) => handleTabKeyDown(event, 'activity')}
          >
            {isCashier ? <ShoppingBag className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            {activityLabel}
          </button>
          <button
            ref={invoicesTabRef}
            id="invoice-history-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'invoices'}
            aria-controls="invoice-history-panel"
            tabIndex={activeTab === 'invoices' ? 0 : -1}
            className={`app-segmented-control__tab ${activeTab === 'invoices' ? 'is-active' : ''}`}
            onClick={() => selectTab('invoices')}
            onKeyDown={(event) => handleTabKeyDown(event, 'invoices')}
          >
            <FileText className="h-4 w-4" />
            Invoices
          </button>
        </div>

        {activeTab === 'activity'
          ? (isCashier ? <SoldItemsTable /> : <AuditLogTable />)
          : <InvoiceHistory shopId={activeMembership?.shop_id ?? ''} />}
      </div>
    </div>
  );
};
