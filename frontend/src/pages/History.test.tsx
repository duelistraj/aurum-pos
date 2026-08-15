import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { downloadUrl, printInvoicePdf } from '../utils';
import { Transactions } from './History';

vi.mock('../api/client', () => ({
  apiClient: {
    getChangeLogHistory: vi.fn(),
    getAuditActorOptions: vi.fn(),
    getCashierSoldHistory: vi.fn(),
    getInvoiceDownload: vi.fn(),
    getInvoicePdf: vi.fn(),
    getWhatsAppCapability: vi.fn(),
    sendInvoiceToWhatsApp: vi.fn(),
    listInvoices: vi.fn(),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils')>();
  return { ...original, downloadUrl: vi.fn(), printInvoicePdf: vi.fn() };
});

const managerMembership = {
  shop_id: 'shop-1',
  organization_id: 'organization-1',
  organization_name: 'Demo Organization',
  is_primary: true,
  access_mode: 'read_write' as const,
  shop_name: 'Demo Shop',
  shop_slug: 'demo',
  role: 'MANAGER' as const,
};

const renderTransactions = (initialEntry = '/transactions') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Transactions />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Transactions', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: managerMembership,
      canManage: false,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(apiClient.getAuditActorOptions).mockResolvedValue([{
      user_id: 'user-1',
      name: 'Mira Manager',
      role: 'MANAGER',
    }]);
    vi.mocked(apiClient.getChangeLogHistory).mockResolvedValue({
      entries: [{
        id: 'entry-1',
        event_type: 'inventory.item_updated',
        area: 'Inventory',
        subject: {
          type: 'item',
          id: 'item-1',
          label: 'Gold Ring',
          reference: '12345678',
        },
        actor: {
          kind: 'user',
          user_id: 'user-1',
          name: 'Mira Manager',
          role: 'MANAGER',
        },
        summary: 'Changed 1 field',
        details: {
          kind: 'changes',
          changes: [{
            field: 'quantity',
            label: 'Quantity',
            before: 2,
            after: 4,
          }],
          facts: [],
          sale_items: [],
          total: null,
        },
        created_at: '2026-08-15T08:30:00Z',
      }, {
        id: 'entry-2',
        event_type: 'sales.sale_completed',
        area: 'Sales',
        subject: {
          type: 'sale',
          id: 'sale-1',
          label: 'Invoice INV-2026-000001',
          reference: 'INV-2026-000001',
        },
        actor: {
          kind: 'user',
          user_id: 'user-1',
          name: 'Mira Manager',
          role: 'MANAGER',
        },
        summary: '1 item sold',
        details: {
          kind: 'sale',
          changes: [],
          facts: [],
          sale_items: [{
            item_id: 'item-1',
            name: 'Gold Ring',
            sku: 'RING-1',
            barcode: '12345678',
            quantity: 1,
            weight_grams: null,
            amount: 12500,
          }],
          total: 12500,
        },
        created_at: '2026-08-15T08:29:00Z',
      }],
      total: 2,
      page: 1,
      limit: 10,
      pages: 1,
    });
    vi.mocked(apiClient.getCashierSoldHistory).mockResolvedValue({
      entries: [{
        id: 'entry-2',
        item_id: 'item-1',
        item_name: 'Gold Ring',
        sku: 'RING-1',
        barcode: '12345678',
        invoice_no: 'INV-2026-000001',
        quantity: 1,
        weight_grams: null,
        amount: 12500,
        created_at: '2026-08-15T08:29:00Z',
      }],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });
    vi.mocked(apiClient.listInvoices).mockResolvedValue({
      invoices: [{
        sale_id: 'sale-1',
        invoice_no: 'INV-2026-000001',
        created_at: '2026-08-15T08:30:00Z',
        customer_name: 'Aditi Customer',
        customer_phone: '9999999999',
        total_amount: 12500,
        pdf_status: 'ready',
        pdf_generated_at: '2026-08-15T08:31:00Z',
        whatsapp_delivery_status: null,
        whatsapp_consent_confirmed_at: null,
      }],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });
    vi.mocked(apiClient.getInvoiceDownload).mockResolvedValue({
      url: 'https://example.invalid/invoice',
      expires_in_seconds: 600,
    });
    vi.mocked(downloadUrl).mockResolvedValue(undefined);
    vi.mocked(printInvoicePdf).mockResolvedValue(undefined);
    vi.mocked(apiClient.getInvoicePdf).mockResolvedValue(new ArrayBuffer(8));
    vi.mocked(apiClient.getWhatsAppCapability).mockResolvedValue({
      enabled: true,
      available: true,
      pro_required: true,
      sender_name: 'Aurum POS',
      template_status: 'approved',
    });
    vi.mocked(apiClient.sendInvoiceToWhatsApp).mockResolvedValue({
      delivery_id: 'delivery-1',
      status: 'pending',
    });
  });

  it('renders management activity as a compact audit table with actor attribution', async () => {
    renderTransactions();

    expect(screen.getByRole('tab', { name: 'Audit Log' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('table')).toHaveClass('audit-table');
    expect(screen.getByText('Gold Ring')).toBeInTheDocument();
    expect(screen.getAllByText('Mira Manager').length).toBeGreaterThan(0);
    expect(screen.getByText('12345678')).toBeInTheDocument();
    expect(apiClient.getChangeLogHistory).toHaveBeenCalledWith({
      search: undefined,
      event_type: undefined,
      actor_user_id: undefined,
      from_date: undefined,
      to_date: undefined,
      page: 1,
      limit: 10,
    });
    expect(screen.queryByRole('heading', { name: 'Audit log' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 2 of 2 events');
  });

  it('reveals structured before and after values without raw payload cards', async () => {
    const user = userEvent.setup();
    renderTransactions();

    await user.click(await screen.findByRole('button', { name: 'Show details for Gold Ring' }));

    expect(screen.getByRole('columnheader', { name: 'Previous value' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'New value' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Quantity' })).toBeInTheDocument();
    expect(screen.queryByText('Detailed Changes & Log Metadata')).not.toBeInTheDocument();
  });

  it('groups a completed sale into one expandable invoice row', async () => {
    const user = userEvent.setup();
    renderTransactions();

    await user.click(await screen.findByRole('button', {
      name: 'Show details for Invoice INV-2026-000001',
    }));

    expect(screen.getByText('Sold items')).toBeInTheDocument();
    expect(screen.getByText('RING-1')).toBeInTheDocument();
    expect(screen.getAllByText('₹12,500.00').length).toBeGreaterThan(0);
  });

  it('applies live audit filters and groups ownership transfers', async () => {
    const user = userEvent.setup();
    renderTransactions();
    await screen.findByText('Gold Ring');

    await user.type(screen.getByRole('textbox', { name: 'Record or reference' }), '12345678');
    await user.click(screen.getByRole('button', { name: 'Event type All events' }));
    await user.click(screen.getByRole('option', { name: 'Ownership transfer' }));
    await user.click(screen.getByRole('button', { name: 'Performed by Everyone' }));
    await user.click(screen.getByRole('option', { name: /Mira Manager/ }));
    const fromDate = screen.getByLabelText('From date');
    const toDate = screen.getByLabelText('To date');
    await user.type(fromDate, '2026-08-01');
    await user.type(toDate, '2026-08-15');

    await waitFor(() => expect(apiClient.getChangeLogHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: '12345678',
        event_type: 'team.ownership_transfer',
        actor_user_id: 'user-1',
        from_date: new Date('2026-08-01T00:00:00').toISOString(),
        to_date: new Date('2026-08-15T23:59:59.999').toISOString(),
      }),
    ));
    expect(fromDate).toHaveAttribute('type', 'date');
    expect(toDate).toHaveAttribute('type', 'date');
    expect(screen.queryByRole('button', { name: 'Search audit log' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset filters' })).not.toBeInTheDocument();
  });

  it('changes the audit query limit from the shared rows control', async () => {
    const user = userEvent.setup();
    renderTransactions();

    await screen.findByText('Gold Ring');
    await user.click(screen.getByRole('button', { name: 'Rows per page' }));
    await user.click(screen.getByRole('option', { name: '20' }));

    await waitFor(() => expect(apiClient.getChangeLogHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    ));
  });

  it('shows cashiers a today-only sold-items table without management filters', async () => {
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: { ...managerMembership, role: 'CASHIER' },
      canManage: false,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });

    renderTransactions();

    expect(screen.getByRole('tab', { name: 'Sold Items' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('table')).toHaveClass('sold-items-table');
    expect(screen.getByText('Sold items today')).toBeInTheDocument();
    expect(screen.queryByText('Event type')).not.toBeInTheDocument();
    expect(screen.queryByText('Performed by')).not.toBeInTheDocument();
    expect(apiClient.getCashierSoldHistory).toHaveBeenCalledWith({
      search: undefined,
      page: 1,
      limit: 10,
    });
    expect(apiClient.getChangeLogHistory).not.toHaveBeenCalled();
    expect(apiClient.getAuditActorOptions).not.toHaveBeenCalled();
  });

  it('keeps invoice download, print, and WhatsApp actions unchanged', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    expect(await screen.findByText('INV-2026-000001')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Invoice history' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 1 to 1 of 1 invoices');
    expect(apiClient.listInvoices).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      search: undefined,
      from_date: undefined,
      to_date: undefined,
      pdf_status: undefined,
    });

    await user.click(screen.getByRole('button', { name: 'Download INV-2026-000001' }));
    await user.click(screen.getByRole('button', { name: 'Print INV-2026-000001' }));
    await user.click(screen.getByRole('button', { name: 'WhatsApp INV-2026-000001' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and send' }));

    await waitFor(() => {
      expect(apiClient.getInvoiceDownload).toHaveBeenCalledWith('sale-1');
      expect(apiClient.getInvoicePdf).toHaveBeenCalledWith('sale-1');
      expect(apiClient.sendInvoiceToWhatsApp).toHaveBeenCalledWith(
        'sale-1',
        expect.objectContaining({ confirm_customer_request: true }),
        expect.any(String),
      );
    });
  });

  it('applies invoice filters as they change without action buttons', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    await screen.findByText('INV-2026-000001');
    await user.type(screen.getByRole('textbox', { name: 'Search invoices' }), 'Aditi');
    await user.click(screen.getByRole('button', { name: 'PDF status All statuses' }));
    await user.click(screen.getByRole('option', { name: 'Ready' }));
    const fromDate = screen.getByLabelText('From');
    const toDate = screen.getByLabelText('To');
    await user.type(fromDate, '2026-08-01');
    await user.type(toDate, '2026-08-15');

    await waitFor(() => expect(apiClient.listInvoices).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'Aditi',
        pdf_status: 'ready',
        from_date: new Date('2026-08-01T00:00:00').toISOString(),
        to_date: new Date('2026-08-15T23:59:59.999').toISOString(),
      }),
    ));
    expect(screen.queryByRole('button', { name: 'Search invoices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset invoice filters' })).not.toBeInTheDocument();
  });

  it('keeps the compact invoice mobile details unchanged', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    const disclosure = await screen.findByRole('button', {
      name: 'Show details for INV-2026-000001',
    });
    await user.click(disclosure);

    const details = document.getElementById('invoice-details-sale-1');
    expect(details).not.toBeNull();
    expect(within(details!).getByText('Aditi Customer')).toBeInTheDocument();
    expect(within(details!).getByText('9999999999')).toBeInTheDocument();
  });

  it('falls back to the role-specific first tab for an unknown tab value', async () => {
    renderTransactions('/transactions?tab=unknown');

    expect(screen.getByRole('tab', { name: 'Audit Log' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Gold Ring')).toBeInTheDocument();
    expect(apiClient.listInvoices).not.toHaveBeenCalled();
  });
});
