import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { downloadUrl } from '../utils';
import { Transactions } from './History';

vi.mock('../api/client', () => ({
  apiClient: {
    getChangeLogHistory: vi.fn(),
    getInvoiceDownload: vi.fn(),
    listInvoices: vi.fn(),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils')>();
  return { ...original, downloadUrl: vi.fn() };
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

    await waitFor(() => {
      expect(apiClient.getInvoiceDownload).toHaveBeenCalledWith('sale-1');
      expect(downloadUrl).toHaveBeenCalledWith(
        'https://example.invalid/invoice',
        'INV-2026-000001.pdf',
      );
    });
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
