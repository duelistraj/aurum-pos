import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { Navbar } from '../components/Navbar';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { downloadBlob } from '../utils';
import { getPreference, setPreference } from '../utils/storage';
import { Items } from './Items';

vi.mock('../api/client', () => ({
  apiClient: {
    createItem: vi.fn(),
    deleteItem: vi.fn(),
    deleteItems: vi.fn(),
    getAvailableMetals: vi.fn(),
    getBatchLabels: vi.fn(),
    getEntitlement: vi.fn(),
    getItems: vi.fn(),
    getItemsSummary: vi.fn(),
    getLatestItem: vi.fn(),
    logout: vi.fn(),
    updateItem: vi.fn(),
    version: vi.fn(),
  },
}));
vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../utils/storage', () => ({
  getPreference: vi.fn(),
  setPreference: vi.fn(),
}));
vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>();
  return {
    ...actual,
    downloadBlob: vi.fn(),
  };
});

const PHONE_VIEWPORT_QUERY = '(max-width: 639px)';
let isPhoneViewport = false;
const viewportListeners = new Set<EventListenerOrEventListenerObject>();

const installMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === PHONE_VIEWPORT_QUERY
        ? isPhoneViewport
        : query === '(min-width: 640px)' && !isPhoneViewport,
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') viewportListeners.add(listener);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'change') viewportListeners.delete(listener);
      },
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const setPhoneViewport = (nextValue: boolean) => {
  isPhoneViewport = nextValue;
  const event = new Event('change');
  viewportListeners.forEach((listener) => {
    if (typeof listener === 'function') listener(event);
    else listener.handleEvent(event);
  });
};

const membership = {
  shop_id: 'shop-1',
  organization_id: 'organization-1',
  organization_name: 'Demo Organization',
  is_primary: true,
  access_mode: 'read_write' as const,
  shop_name: 'Demo Shop',
  shop_slug: 'demo-shop',
  role: 'OWNER' as const,
};

const renderInventoryWithNavbar = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Navbar
          collapsed={false}
          mobileOpen={false}
          onCloseMobile={vi.fn()}
        />
        <Items />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Inventory entitlement usage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    isPhoneViewport = false;
    viewportListeners.clear();
    installMatchMedia();
    vi.mocked(getPreference).mockResolvedValue(null);
    vi.mocked(setPreference).mockResolvedValue(undefined);
    vi.mocked(useConfig).mockReturnValue({
      appName: 'Aurum POS',
      isDarkMode: false,
      toggleDarkMode: vi.fn(),
    });
    vi.mocked(useShop).mockReturnValue({
      user: {
        user_id: 'user-1',
        email: 'owner@example.com',
        full_name: 'Owner',
        memberships: [membership],
      },
      memberships: [membership],
      activeMembership: membership,
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(apiClient.getEntitlement)
      .mockResolvedValueOnce({
        organization_id: 'organization-1',
        plan: 'free',
        source: 'hosted_free',
        active_item_limit: 50,
        active_item_count: 12,
        can_add_item: true,
        shop_limit: 1,
        shop_count: 1,
        team_seat_limit: 2,
        team_seat_usage: 1,
        can_create_shop: false,
        can_invite_member: true,
        access_mode: 'read_write',
        expires_at: null,
      })
      .mockResolvedValue({
        organization_id: 'organization-1',
        plan: 'free',
        source: 'hosted_free',
        active_item_limit: 50,
        active_item_count: 13,
        can_add_item: true,
        shop_limit: 1,
        shop_count: 1,
        team_seat_limit: 2,
        team_seat_usage: 1,
        can_create_shop: false,
        can_invite_member: true,
        access_mode: 'read_write',
        expires_at: null,
      });
    vi.mocked(apiClient.getAvailableMetals).mockResolvedValue({ Silver: [92.5] });
    vi.mocked(apiClient.getLatestItem).mockRejectedValue(new Error('No item'));
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 10,
      pages: 0,
    });
    vi.mocked(apiClient.getItemsSummary).mockResolvedValue({
      total_items: 0,
      in_stock: 0,
      unique_items: 0,
      sold_items: 0,
      items_925_count: 0,
    });
    vi.mocked(apiClient.getBatchLabels).mockResolvedValue(new Blob(['labels']));
    vi.mocked(downloadBlob).mockResolvedValue(undefined);
    vi.mocked(apiClient.createItem).mockResolvedValue({
      id: 'item-1',
      sku: 'RING-1',
      barcode: '12345678',
      category: 'jewellery',
      name: 'Silver Ring',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    });
    vi.mocked(apiClient.version).mockResolvedValue({
      version: '0.4.0',
      revision: 'abc123',
      license: 'AGPL-3.0-only',
      source: 'https://github.com/duelistraj/aurum-pos',
      deployment_mode: 'hosted',
    });
  });

  it('requests in-stock inventory by default', async () => {
    renderInventoryWithNavbar();

    await waitFor(() => expect(apiClient.getItems).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'in_stock' }),
    ));
    expect(screen.getAllByText('In Stock').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument();
  });

  it('shows metal and stone cards without an aggregate in-stock card', async () => {
    renderInventoryWithNavbar();

    await screen.findByText('Gold Items');
    const labels = Array.from(document.querySelectorAll('.inventory-summary-card'))
      .map((card) => card.querySelector('p')?.textContent);
    expect(labels).toEqual(['Gold Items', 'Silver Items', 'Platinum Items', 'Stones']);
  });

  it('limits notes to 50 characters and reports the remaining form capacity', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();
    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    const notes = within(dialog).getByPlaceholderText('Add any notes about this item');
    expect(notes).toHaveAttribute('maxlength', '50');
    await user.type(notes, 'x'.repeat(51));
    expect(notes).toHaveValue('x'.repeat(50));
    expect(within(dialog).getByText('50/50')).toBeInTheDocument();
  });

  it('orders jewellery identity, pricing, stock, pricing inputs, and notes consistently', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();
    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    expect(within(dialog).getByText('Metal *').parentElement).toHaveClass('order-1');
    expect(within(dialog).getByText('Purity *').parentElement).toHaveClass('order-1');
    expect(within(dialog).getByText('Pricing method').parentElement).toHaveClass('order-2');
    expect(within(dialog).getByText('Stock is deducted by').parentElement).toHaveClass('order-2');
    expect(within(dialog).getByText('SKU *').parentElement).toHaveClass('order-3');
    expect(within(dialog).getByText('Item Name *').parentElement).toHaveClass('order-3');
    expect(within(dialog).getByText('Category *').parentElement).toHaveClass('order-4');
    expect(within(dialog).getByText('Quantity *').parentElement).toHaveClass('order-4');
    expect(within(dialog).getByText('Making Charge per gram *').parentElement)
      .toHaveClass('order-5');
    expect(within(dialog).getByText('Weight (g) *').parentElement).toHaveClass('order-5');
    expect(within(dialog).getByText('Notes (Optional)').closest('.order-6')).not.toBeNull();
  });

  it('restores validated inventory filters from the active shop preference', async () => {
    vi.mocked(getPreference).mockResolvedValue(JSON.stringify({
      metal: 'gold',
      category: 'ring',
      status: 'sold',
    }));

    renderInventoryWithNavbar();

    await waitFor(() => expect(getPreference).toHaveBeenCalledWith('inventory-filters:shop-1'));
    await waitFor(() => expect(apiClient.getItems).toHaveBeenCalledWith(
      expect.objectContaining({ metal: 'gold', category: 'ring', status: 'sold' }),
    ));
  });

  it('persists inventory filter selections under the active shop key', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();
    await waitFor(() => expect(apiClient.getItems).toHaveBeenCalled());

    await user.click(screen.getByText('All Metals'));
    await user.click(screen.getByText('Gold', { exact: true }));

    await waitFor(() => expect(setPreference).toHaveBeenCalledWith(
      'inventory-filters:shop-1',
      JSON.stringify({ metal: 'gold', category: 'all', status: 'in_stock' }),
    ));
  });

  it('falls back to safe defaults when stored filters are invalid', async () => {
    vi.mocked(getPreference).mockResolvedValue('{not-json');

    renderInventoryWithNavbar();

    await waitFor(() => expect(apiClient.getItems).toHaveBeenCalledWith(
      expect.objectContaining({ metal: undefined, category: undefined, status: 'in_stock' }),
    ));
  });

  it('uses metal summary cards and a single fixed-rate field for unique items', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getItemsSummary).mockResolvedValue({
      total_items: 20,
      in_stock: 18,
      unique_items: 1,
      sold_items: 2,
      items_925_count: 5,
      metal_summaries: {
        gold: { in_stock: 8, sold_items: 1, unique_items: 0, purity_counts: {} },
        silver: { in_stock: 7, sold_items: 1, unique_items: 1, purity_counts: {} },
        platinum: { in_stock: 3, sold_items: 0, unique_items: 0, purity_counts: {} },
      },
    });
    vi.mocked(apiClient.getLatestItem).mockResolvedValue({
      id: 'unique-1',
      sku: 'UNIQUE-1',
      barcode: '12345678',
      category: 'unique',
      name: 'Fixed price necklace',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 0,
      making_charge: 0,
      fixed_rate: 850,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    });

    renderInventoryWithNavbar();

    expect(await screen.findByText('Gold Items')).toBeInTheDocument();
    expect(screen.getByText('Silver Items')).toBeInTheDocument();
    expect(screen.getByText('Platinum Items')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    const fixedRateLabel = within(dialog).getByText('Fixed Rate *');
    expect(fixedRateLabel.parentElement?.querySelector('input')).toHaveValue(850);
    expect(within(dialog).queryByText('Weight (g) *')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Weight (g) (Optional)').parentElement)
      .toHaveClass('order-5');
    expect(within(dialog).queryByText('Making Charge *')).not.toBeInTheDocument();
  });

  it('creates stones by selecting Stone from the Add Item metal dropdown', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    const metalField = within(dialog).getByText('Metal *').parentElement!;
    await user.click(metalField.querySelector('.inventory-select-trigger')!);
    const stoneOption = Array.from(
      metalField.querySelectorAll<HTMLElement>('.inventory-dropdown-option'),
    ).find((option) => option.textContent?.includes('Stone'))!;
    await user.click(stoneOption);
    expect(within(dialog).getByText('Metal *')).toBeInTheDocument();
    expect(within(dialog).queryByText('Purity *')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Tax classification *')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/^Weight \(g\)/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Neelam')).toBeInTheDocument();
    expect(within(dialog).getByText('Category *').parentElement).toHaveClass('order-3');
    expect(within(dialog).getByText('Ratti *').parentElement).toHaveClass('order-1');
    expect(within(dialog).getByText('SKU *').parentElement).toHaveClass('order-2');
    expect(within(dialog).getByText('Item Name *').parentElement).toHaveClass('order-2');
    expect(within(dialog).getByText('Quantity *').parentElement).toHaveClass('order-3');
    expect(within(dialog).getByText('Rate per Ratti *').parentElement).toHaveClass('order-4');
    expect(within(dialog).getByText('Notes (Optional)').closest('.order-5')).not.toBeNull();

    await user.type(within(dialog).getByPlaceholderText('e.g., GLD-001'), 'STONE-1');
    await user.type(within(dialog).getByPlaceholderText('e.g., Gold Ring'), 'Blue sapphire');
    const rattiInput = within(dialog).getByText('Ratti *')
      .parentElement?.querySelector('input');
    const rateInput = within(dialog).getByText('Rate per Ratti *')
      .parentElement?.querySelector('input');
    expect(rattiInput).not.toBeNull();
    expect(rateInput).not.toBeNull();
    await user.type(rattiInput!, '2.5');
    await user.type(rateInput!, '1000');
    await user.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    await waitFor(() => expect(apiClient.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        item_type: 'stone',
        category: 'neelam',
        metal: 'stone',
        ratti: 2.5,
        rate_per_ratti: 1000,
      }),
    ));
  });

  it('uses lowercase ratti units in the inventory weight and charge columns', async () => {
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [{
        id: 'stone-1',
        sku: 'STONE-1',
        barcode: '71030001',
        category: 'neelam',
        item_type: 'stone',
        pricing_method: 'rate_per_ratti',
        stock_mode: 'quantity',
        name: 'Blue sapphire',
        metal: 'stone',
        purity: 0,
        net_weight: 0,
        stock_weight: null,
        making_charge: 0,
        fixed_rate: 0,
        ratti: 2.5,
        rate_per_ratti: 1000,
        quantity: 1,
        notes: null,
        status: 'in_stock',
        hsn: '7103',
        gst_rate_percent: 3,
      }],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });

    renderInventoryWithNavbar();

    const row = await screen.findByLabelText('Blue sapphire. Hold to edit, or press Enter.');
    const cells = row.querySelectorAll('td');
    expect(cells[7]).toHaveTextContent('2.5 ratti');
    expect(cells[8]).toHaveTextContent('₹1,000.00 / ratti');
  });

  it('offers the complete jewellery catalogue with one consolidated set category', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    const categoryField = within(dialog).getByText('Category *').parentElement!;
    await user.click(categoryField.querySelector('.inventory-select-trigger')!);

    const categoryLabels = Array.from(
      categoryField.querySelectorAll('.inventory-dropdown-option'),
      (option) => option.textContent,
    );
    expect(categoryLabels).toEqual([
      'Jewellery', 'Jewellery Set', 'Unique', 'Ring', 'Earring', 'Necklace',
      'Chain', 'Pendant', 'Bracelet', 'Bangle', 'Kada', 'Anklet', 'Toe Ring',
      'Nose Pin', 'Nose Ring', 'Mangalsutra', 'Maang Tikka', 'Armlet',
      'Waist Belt', 'Brooch', 'Cufflinks', 'Coin', 'Idol', 'Rakhi', 'Other',
    ]);
    expect(categoryLabels).not.toContain('Choker');
    expect(categoryLabels).not.toContain('Haram');
    expect(categoryLabels).not.toContain('Necklace Set');
  });

  it('keeps the stone catalogue limited to the Navratna categories and Other', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    const metalField = within(dialog).getByText('Metal *').parentElement!;
    await user.click(metalField.querySelector('.inventory-select-trigger')!);
    const stoneOption = Array.from(
      metalField.querySelectorAll<HTMLElement>('.inventory-dropdown-option'),
    ).find((option) => option.textContent?.includes('Stone'))!;
    await user.click(stoneOption);
    const categoryField = within(dialog).getByText('Category *').parentElement!;
    await user.click(categoryField.querySelector('.inventory-select-trigger')!);

    expect(Array.from(
      categoryField.querySelectorAll('.inventory-dropdown-option'),
      (option) => option.textContent,
    )).toEqual([
      'Manik', 'Moti', 'Moonga', 'Panna', 'Pokhraj', 'Heera', 'Neelam',
      'Gomed', 'Lehsunia', 'Other',
    ]);
  });

  it('places sold items second for every specific-metal summary', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.getItemsSummary).mockResolvedValue({
      total_items: 12,
      in_stock: 9,
      unique_items: 1,
      sold_items: 3,
      items_925_count: 2,
      metal_summaries: {
        gold: { in_stock: 3, sold_items: 1, unique_items: 0, purity_counts: { 75: 1, 91.6: 2 } },
        silver: { in_stock: 3, sold_items: 1, unique_items: 1, purity_counts: { 92.5: 2 } },
        platinum: { in_stock: 3, sold_items: 1, unique_items: 0, purity_counts: { 90: 1, 95: 2 } },
      },
    });
    renderInventoryWithNavbar();
    await screen.findByText('Gold Items');

    const cardLabels = () => Array.from(document.querySelectorAll('.inventory-summary-icon'))
      .map((icon) => icon.parentElement?.querySelector('p')?.textContent);
    const chooseMetal = async (currentLabel: string, nextLabel: string) => {
      await user.click(screen.getByText(currentLabel, { exact: true }));
      await user.click(screen.getByText(nextLabel, { exact: true }));
    };

    await chooseMetal('All Metals', 'Gold');
    expect(cardLabels()).toEqual(['In Stock', 'Sold Items', '18K Items', '22K Items']);
    await chooseMetal('Gold', 'Platinum');
    expect(cardLabels()).toEqual(['In Stock', 'Sold Items', '900 Items', '950 Items']);
    await chooseMetal('Platinum', 'Silver');
    expect(cardLabels()).toEqual(['In Stock', 'Sold Items', 'Unique Items', '925 Items']);
  });

  it('refreshes the shared active-item count after adding inventory', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();

    await user.click(screen.getByRole('button', { name: 'Account and settings' }));
    expect(await screen.findByText('12/50 active items')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Item' }));

    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    await user.type(within(dialog).getByPlaceholderText('e.g., GLD-001'), 'RING-1');
    await user.type(within(dialog).getByPlaceholderText('e.g., Gold Ring'), 'Silver Ring');
    const decimalInputs = within(dialog).getAllByPlaceholderText('0.00');
    await user.type(decimalInputs[0], '5');
    await user.type(decimalInputs[1], '100');
    await user.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    await waitFor(() => expect(apiClient.createItem).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Account and settings' }));
    expect(await screen.findByText('13/50 active items')).toBeInTheDocument();
  });

  it('renders the empty state outside the table column grid', async () => {
    renderInventoryWithNavbar();

    const emptyHeading = await screen.findByText('No items found');

    expect(screen.getByRole('table')).toHaveClass('inventory-table');
    expect(emptyHeading.closest('tr')).toBeNull();
    expect(emptyHeading.closest('.inventory-empty-state')).not.toBeNull();
  });

  it('shows weighted total in Weight and the plain remaining balance in Qty', async () => {
    const user = userEvent.setup();
    const note = 'Weighted note that should clamp after two lines';
    const weightedItem = {
      id: 'weighted-item',
      sku: 'WEIGHT-1',
      barcode: '11223344',
      category: 'chain',
      item_type: 'jewellery' as const,
      pricing_method: 'making_charge_per_gram' as const,
      stock_mode: 'weight' as const,
      name: 'Weighted gold chain lot',
      metal: 'gold',
      purity: 91.6,
      net_weight: 50,
      stock_weight: 37.125,
      making_charge: 100,
      quantity: 1,
      notes: note,
      status: 'in_stock',
    };
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [weightedItem],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });

    renderInventoryWithNavbar();

    const disclosure = await screen.findByRole('button', {
      name: 'Show details for 11223344',
    });
    const row = disclosure.closest('tr')!;
    expect(within(row).getByText('37.125 g')).toBeInTheDocument();
    expect(within(row).getByText('50 gram')).toBeInTheDocument();
    expect(within(row).queryByText(/Available|Remaining/)).not.toBeInTheDocument();
    expect(within(row).getByText('37.125 g').closest('td')).toHaveClass('whitespace-nowrap');
    expect(within(row).getByText(note)).toHaveClass('inventory-notes-clamp');
    expect(screen.getByText('Qty').closest('th')).toHaveClass('whitespace-nowrap');

    await user.click(disclosure);
    const details = document.getElementById('inventory-item-details-weighted-item')!;
    expect(within(details).getByText('37.125 g')).toBeInTheDocument();
    expect(within(details).getByText('50 gram')).toBeInTheDocument();
    expect(within(details).getByText(note)).toHaveClass('inventory-notes-clamp');
  });

  it('creates a weighted item with equal total and remaining weight', async () => {
    const user = userEvent.setup();
    renderInventoryWithNavbar();

    await user.click(screen.getByRole('button', { name: 'Add Item' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Item' });
    await user.click(within(dialog).getByRole('radio', { name: 'Weight' }));
    await user.type(within(dialog).getByPlaceholderText('e.g., GLD-001'), 'WEIGHT-1');
    await user.type(within(dialog).getByPlaceholderText('e.g., Gold Ring'), 'Chain lot');
    const weightInput = within(dialog).getByText('Weight (g) *')
      .parentElement?.querySelector('input');
    const makingCharge = within(dialog).getByText('Making Charge per gram *')
      .parentElement?.querySelector('input');
    expect(weightInput).not.toBeNull();
    expect(makingCharge).not.toBeNull();
    await user.type(weightInput!, '50.125');
    await user.type(makingCharge!, '100');
    await user.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    await waitFor(() => expect(apiClient.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        stock_mode: 'weight',
        net_weight: 50.125,
        stock_weight: 50.125,
        quantity: 1,
      }),
    ));
  });

  it('uses a compact disclosure row without losing inventory details or management', async () => {
    const user = userEvent.setup();
    const inventoryItems = [{
      id: 'item-1',
      sku: 'RING-1',
      barcode: '12345678',
      category: 'jewellery',
      name: 'Silver Ring',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: 'Gift wrap requested',
      status: 'in_stock',
    }, {
      id: 'item-2',
      sku: 'CHAIN-1',
      barcode: '87654321',
      category: 'jewellery',
      name: 'Silver Chain',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 12,
      making_charge: 200,
      quantity: 1,
      notes: null,
      status: 'sold',
    }];
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: inventoryItems,
      total: inventoryItems.length,
      page: 1,
      limit: 10,
      pages: 1,
    });
    vi.mocked(apiClient.getItemsSummary).mockResolvedValue({
      total_items: 2,
      in_stock: 1,
      unique_items: 2,
      sold_items: 1,
      items_925_count: 2,
    });

    renderInventoryWithNavbar();

    const firstDisclosure = await screen.findByRole('button', {
      name: 'Show details for 12345678',
    });
    const firstRow = firstDisclosure.closest('tr')!;
    const metalPill = firstRow.querySelector('.inventory-metal-pill');
    const categoryLabel = firstRow.querySelector('.inventory-category-label');
    const skuLabel = firstRow.querySelector('.inventory-sku-pill');
    expect(within(firstRow).getByText('Stock')).toBeInTheDocument();
    expect(metalPill).toHaveTextContent('Silver·92.5%');
    expect(metalPill).toHaveClass('inventory-metal-pill--silver');
    expect(within(firstRow).getByText('Gift wrap requested')).toBeInTheDocument();
    expect(within(firstRow).getByText('Jewellery').querySelector('svg')).not.toBeNull();
    expect(categoryLabel).toHaveClass('inventory-category-label');
    expect(categoryLabel).not.toHaveClass('bg-blue-50');
    expect(skuLabel).not.toHaveClass('bg-blue-50');
    expect(skuLabel).toHaveClass('text-sm');
    expect(within(firstRow).getByTitle('12345678')).toHaveClass('text-sm');
    expect(within(firstRow).getByTitle('Silver Ring')).toHaveClass('text-sm');
    expect(categoryLabel).toHaveClass('text-sm');
    expect(metalPill).toHaveClass('text-sm');
    expect(within(firstRow).getByText('Stock')).toHaveClass('sm:text-sm');
    const statusCell = within(firstRow).getByText('Stock').closest('td')!;
    const notesCell = within(firstRow).getByText('Gift wrap requested').closest('td')!;
    expect(statusCell.compareDocumentPosition(notesCell) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
    expect(firstDisclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Full barcode')).not.toBeInTheDocument();

    await user.click(firstDisclosure);

    expect(screen.getByRole('button', { name: 'Hide details for 12345678' }))
      .toHaveAttribute('aria-expanded', 'true');
    const firstDetails = document.getElementById('inventory-item-details-item-1');
    expect(firstDetails).not.toBeNull();
    expect(within(firstDetails!).getByText('RING-1')).toBeInTheDocument();
    expect(within(firstDetails!).getByText('₹100.00')).toBeInTheDocument();
    expect(within(firstDetails!).getByText('Gift wrap requested')).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(document.getElementById('inventory-item-details-item-1')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show details for 87654321' }));

    expect(document.getElementById('inventory-item-details-item-1')).toBeNull();
    expect(document.getElementById('inventory-item-details-item-2')).not.toBeNull();

    expect(screen.getByRole('checkbox', { name: 'Select all items on this page' }))
      .toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Show details for 12345678' }));
    await waitFor(() => {
      expect(document.getElementById('inventory-item-details-item-1')).not.toBeNull();
    });
    const managedDetails = document.getElementById('inventory-item-details-item-1');
    expect(within(managedDetails!).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(managedDetails!).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    firstRow.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Edit Item' })).toBeInTheDocument();
  });

  it('keeps pagination and current rows stable while the next page loads', async () => {
    const user = userEvent.setup();
    const firstItem = {
      id: 'item-page-1',
      sku: 'PAGE-1',
      barcode: '11111111',
      category: 'jewellery',
      name: 'First page item',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    };
    const secondItem = {
      ...firstItem,
      id: 'item-page-2',
      sku: 'PAGE-2',
      barcode: '22222222',
      name: 'Second page item',
    };
    let resolveSecondPage: ((value: {
      items: typeof firstItem[];
      total: number;
      page: number;
      limit: number;
      pages: number;
    }) => void) | undefined;
    vi.mocked(apiClient.getItems)
      .mockResolvedValueOnce({
        items: [firstItem],
        total: 11,
        page: 1,
        limit: 10,
        pages: 2,
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondPage = resolve;
      }));

    renderInventoryWithNavbar();

    expect(await screen.findByText('First page item')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(screen.getByRole('status', { name: 'Loading inventory page' }))
      .toBeInTheDocument();
    expect(screen.getByText('First page item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 2' })).toBeDisabled();

    resolveSecondPage?.({
      items: [secondItem],
      total: 11,
      page: 2,
      limit: 10,
      pages: 2,
    });
    expect(await screen.findByText('Second page item')).toBeInTheDocument();
  });

  it('opens editing after a 600ms row hold and deletes selections through one batch request', async () => {
    const user = userEvent.setup();
    const inventoryItem = {
      id: 'item-gesture',
      sku: 'GESTURE-1',
      barcode: '13572468',
      category: 'ring',
      name: 'Gesture Ring',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    };
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [inventoryItem],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });

    renderInventoryWithNavbar();
    const rowLabel = await screen.findByLabelText('Gesture Ring. Hold to edit, or press Enter.');
    fireEvent.pointerDown(rowLabel, { button: 0, clientX: 20, clientY: 20 });
    expect(rowLabel).toHaveClass('inventory-table__row--pressing');
    await waitFor(
      () => expect(screen.getByRole('dialog', { name: 'Edit Item' })).toBeInTheDocument(),
      { timeout: 900 },
    );
    expect(screen.getByRole('dialog', { name: 'Edit Item' })).toHaveClass('inventory-edit-modal');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('checkbox', { name: 'Select 13572468' }));
    await user.click(screen.getByRole('button', { name: 'Delete selected items' }));
    let deleteDialog = screen.getByRole('dialog', { name: 'Delete item' });
    expect(deleteDialog).toHaveTextContent('Delete the selected item from inventory?');
    expect(deleteDialog).toHaveTextContent('This action cannot be undone.');
    expect(apiClient.deleteItems).not.toHaveBeenCalled();
    await user.click(within(deleteDialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Delete item' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete selected items' }));
    deleteDialog = screen.getByRole('dialog', { name: 'Delete item' });
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete item' }));
    await waitFor(() => expect(apiClient.deleteItems).toHaveBeenCalledWith(['item-gesture']));
  });

  it('uses a compact role-gated action bar and download menu on phones', async () => {
    setPhoneViewport(true);
    const user = userEvent.setup();
    const inventoryItem = {
      id: 'item-phone',
      sku: 'PHONE-1',
      barcode: '12345678',
      category: 'jewellery',
      name: 'Phone Silver Ring',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    };
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [inventoryItem],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });

    renderInventoryWithNavbar();

    expect(await screen.findByText('Phone Silver Ring')).toBeInTheDocument();
    const actions = screen.getByRole('group', {
      name: 'Inventory management actions',
    });
    const initialActionButtons = within(actions).getAllByRole('button');
    expect(initialActionButtons).toHaveLength(1);
    expect(initialActionButtons[0]).toHaveAccessibleName('Add Item');

    await user.click(screen.getByRole('checkbox', { name: 'Select 12345678' }));

    const actionButtons = within(actions).getAllByRole('button');

    expect(actionButtons).toHaveLength(3);
    expect(actionButtons[0]).toHaveAccessibleName('Add Item');
    expect(actionButtons[0]).not.toHaveTextContent('Add Item');
    expect(actionButtons[0].querySelector('svg')).toHaveClass('h-6', 'w-6');
    expect(actionButtons[1]).toHaveAccessibleName('Download selected item labels');
    expect(actionButtons[1]).not.toHaveTextContent('Download');
    expect(actionButtons[1].querySelector('svg')).toHaveClass('h-6', 'w-6');
    expect(actionButtons[2]).toHaveAccessibleName('Delete selected items');
    expect(actionButtons[2].querySelector('svg')).toHaveClass('h-6', 'w-6');

    await user.click(actionButtons[1]);

    const menu = screen.getByRole('menu', {
      name: 'Download selected item labels',
    });
    expect(menu).toHaveClass('inventory-download__menu--standard');
    expect(within(menu).getByRole('menuitem', { name: 'Excel (.xlsx)' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'PDF (.pdf)' })).toBeInTheDocument();
    expect(within(menu).queryByText('Download as Excel file')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Download as PDF file')).not.toBeInTheDocument();
    expect(menu.querySelector('.document-format-icon--xlsx')).not.toBeNull();
    expect(menu.querySelector('.document-format-icon--pdf')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(actionButtons[1]).toHaveFocus();

    await user.click(actionButtons[1]);
    await user.click(screen.getByRole('menuitem', { name: 'Excel (.xlsx)' }));

    await waitFor(() => {
      expect(apiClient.getBatchLabels).toHaveBeenCalledWith(['item-phone'], 'xlsx');
      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        'selected-labels.xlsx',
      );
    });
  });

  it('keeps full labels and detailed downloads from the tablet breakpoint upward', async () => {
    const user = userEvent.setup();
    const inventoryItem = {
      id: 'item-tablet',
      sku: 'TABLET-1',
      barcode: '87654321',
      category: 'jewellery',
      name: 'Tablet Silver Ring',
      metal: 'Silver',
      purity: 92.5,
      net_weight: 5,
      making_charge: 100,
      quantity: 1,
      notes: null,
      status: 'in_stock',
    };
    vi.mocked(apiClient.getItems).mockResolvedValue({
      items: [inventoryItem],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });

    renderInventoryWithNavbar();

    expect(await screen.findByText('Tablet Silver Ring')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select 87654321' }));

    const actions = screen.getByRole('group', {
      name: 'Inventory management actions',
    });
    const actionButtons = within(actions).getAllByRole('button');

    expect(actionButtons).toHaveLength(3);
    expect(actionButtons[0]).toHaveAccessibleName('Add Item');
    expect(actionButtons[0]).not.toHaveTextContent('Add Item');
    expect(actionButtons[1]).toHaveAccessibleName('Download selected item labels');
    expect(actionButtons[2]).toHaveAccessibleName('Delete selected items');

    await user.click(actionButtons[1]);

    const menu = screen.getByRole('menu', {
      name: 'Download selected item labels',
    });
    expect(menu).not.toHaveClass('inventory-download__menu--compact');
    expect(within(menu).getByText('Excel (.xlsx)')).toBeInTheDocument();
    expect(within(menu).queryByText('Download as Excel file')).not.toBeInTheDocument();
    expect(within(menu).getByText('PDF (.pdf)')).toBeInTheDocument();
    expect(within(menu).queryByText('Download as PDF file')).not.toBeInTheDocument();
    expect(menu.querySelector('.document-format-icon--xlsx')).not.toBeNull();
    expect(menu.querySelector('.document-format-icon--pdf')).not.toBeNull();
    expect(menu.querySelector('.document-format-icon--xlsx')).toHaveClass('h-6', 'w-6');
    expect(menu.querySelector('.document-format-icon--pdf')).toHaveClass('h-6', 'w-6');

    act(() => setPhoneViewport(true));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const phoneActions = within(actions).getAllByRole('button');
    expect(phoneActions[0]).toHaveAccessibleName('Add Item');
    expect(phoneActions[1]).toHaveAccessibleName('Download selected item labels');
  });
});
