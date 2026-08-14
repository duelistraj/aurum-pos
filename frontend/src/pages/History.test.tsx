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
      activeMembership: {
        shop_id: 'shop-1',
        organization_id: 'organization-1',
        organization_name: 'Demo Organization',
        is_primary: true,
        access_mode: 'read_write',
        shop_name: 'Demo Shop',
        shop_slug: 'demo',
        role: 'CASHIER',
      },
      canManage: false,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(apiClient.getChangeLogHistory).mockResolvedValue({
      entries: [{
        id: 'entry-1',
        entity: 'sale',
        action: 'create',
        payload: {
          invoice_no: 'INV-2026-000001',
          customer_phone: '9999999999',
          total: 12500,
        },
        created_at: '2026-07-28T08:30:00Z',
      }, {
        id: 'entry-2',
        entity: 'item',
        action: 'sold',
        payload: {
          barcode: 'SKU-1',
          batches: [{
            invoice_no: 'INV-2026-000001',
            note: 'Retained detail',
          }],
        },
        created_at: '2026-07-28T08:29:00Z',
      }],
      total: 2,
      page: 1,
      limit: 50,
      pages: 1,
    });
    vi.mocked(apiClient.listInvoices).mockResolvedValue({
      invoices: [{
        sale_id: 'sale-1',
        invoice_no: 'INV-2026-000001',
        created_at: '2026-07-28T08:30:00Z',
        customer_name: 'Aditi Customer',
        customer_phone: '9999999999',
        total_amount: 12500,
        pdf_status: 'ready',
        pdf_generated_at: '2026-07-28T08:31:00Z',
        whatsapp_delivery_status: null,
        whatsapp_consent_confirmed_at: null,
      }],
      total: 1,
      page: 1,
      limit: 25,
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

  it('shows activity by default without exposing invoice numbers', async () => {
    const user = userEvent.setup();
    renderTransactions();

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('textbox', { name: 'Invoice No' })).not.toBeInTheDocument();
    expect(await screen.findByText('Sale created')).toBeInTheDocument();
    expect(screen.queryByText(/INV-2026-000001/)).not.toBeInTheDocument();

    await user.click(screen.getByText('Sale created'));

    expect(screen.getByText('Customer Phone')).toBeInTheDocument();
    expect(screen.queryByText(/INV-2026-000001/)).not.toBeInTheDocument();

    await user.click(screen.getByText('Item sold: SKU-1'));

    expect(screen.getByText(/Retained detail/)).toBeInTheDocument();
    expect(screen.queryByText(/INV-2026-000001/)).not.toBeInTheDocument();
    expect(apiClient.getChangeLogHistory).toHaveBeenCalledWith({
      barcode: undefined,
      action: undefined,
      from_date: undefined,
      to_date: undefined,
      page: 1,
      limit: 50,
    });
  });

  it('lets a cashier search and download invoices from the invoice tab', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    expect(screen.getByRole('tab', { name: 'Invoices' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('INV-2026-000001')).toBeInTheDocument();
    expect(apiClient.getChangeLogHistory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Download INV-2026-000001' }));

    expect(screen.queryByText(/^Download$/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(apiClient.getInvoiceDownload).toHaveBeenCalledWith('sale-1');
      expect(downloadUrl).toHaveBeenCalledWith(
        'https://example.invalid/invoice',
        'INV-2026-000001.pdf',
      );
    });
  });

  it('prints the exact stored invoice from an icon-only action', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    await user.click(await screen.findByRole('button', {
      name: 'Print INV-2026-000001',
    }));

    await waitFor(() => {
      expect(apiClient.getInvoicePdf).toHaveBeenCalledWith('sale-1');
      expect(printInvoicePdf).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'INV-2026-000001.pdf',
      );
    });
    expect(screen.queryByText(/^Print$/)).not.toBeInTheDocument();
  });

  it('confirms shared-sender consent before queuing a WhatsApp invoice', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    await user.click(await screen.findByRole('button', {
      name: 'WhatsApp INV-2026-000001',
    }));

    expect(screen.getByRole('dialog', { name: 'Send invoice on WhatsApp' }))
      .toHaveTextContent('Aurum POS will send it on behalf of Demo Shop');
    await user.click(screen.getByRole('button', { name: 'Confirm and send' }));

    await waitFor(() => expect(apiClient.sendInvoiceToWhatsApp).toHaveBeenCalledWith(
      'sale-1',
      expect.objectContaining({ confirm_customer_request: true }),
      expect.any(String),
    ));
    expect(screen.queryByText(/^WhatsApp$/)).not.toBeInTheDocument();
  });

  it('expands one compact invoice row into complete mobile details', async () => {
    const user = userEvent.setup();
    renderTransactions('/transactions?tab=invoices');

    const disclosure = await screen.findByRole('button', {
      name: 'Show details for INV-2026-000001',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    await user.click(disclosure);

    expect(screen.getByRole('button', { name: 'Hide details for INV-2026-000001' }))
      .toHaveAttribute('aria-expanded', 'true');
    const details = document.getElementById('invoice-details-sale-1');
    expect(details).not.toBeNull();
    expect(within(details!).getByText('Aditi Customer')).toBeInTheDocument();
    expect(within(details!).getByText('9999999999')).toBeInTheDocument();
    expect(within(details!).getByText('₹12,500.00')).toBeInTheDocument();
    expect(within(details!).getByRole('button', {
      name: 'Download INV-2026-000001 from details',
    })).toBeEnabled();
  });

  it('shows an invoice download handoff failure to the cashier', async () => {
    const user = userEvent.setup();
    vi.mocked(downloadUrl).mockRejectedValueOnce(new Error('Unable to open invoice'));
    renderTransactions('/transactions?tab=invoices');

    await user.click(
      await screen.findByRole('button', { name: 'Download INV-2026-000001' }),
    );

    expect(await screen.findByText('Unable to open invoice')).toBeInTheDocument();
  });

  it('falls back to activity for an unknown tab', async () => {
    renderTransactions('/transactions?tab=unknown');

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Sale created')).toBeInTheDocument();
    expect(apiClient.listInvoices).not.toHaveBeenCalled();
  });
});
