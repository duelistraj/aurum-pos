import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
      version: '0.2.0',
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
    expect(within(dialog).queryByText('Net Weight (g) *')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Making Charge *')).not.toBeInTheDocument();
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
      notes: null,
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
    expect(within(firstRow).getByText('Stock')).toBeInTheDocument();
    expect(metalPill).toHaveTextContent('Silver·92.5%');
    expect(firstDisclosure).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Full barcode')).not.toBeInTheDocument();

    await user.click(firstDisclosure);

    expect(screen.getByRole('button', { name: 'Hide details for 12345678' }))
      .toHaveAttribute('aria-expanded', 'true');
    const firstDetails = document.getElementById('inventory-item-details-item-1');
    expect(firstDetails).not.toBeNull();
    expect(within(firstDetails!).getByText('RING-1')).toBeInTheDocument();
    expect(within(firstDetails!).getByText('₹100.00')).toBeInTheDocument();
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
    expect(within(managedDetails!).getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(within(managedDetails!).getByRole('button', { name: 'Delete' })).toBeEnabled();
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
    await user.click(screen.getByRole('button', { name: '2' }));

    expect(screen.getByRole('status', { name: 'Loading inventory page' }))
      .toBeInTheDocument();
    expect(screen.getByText('First page item')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeDisabled();

    resolveSecondPage?.({
      items: [secondItem],
      total: 11,
      page: 2,
      limit: 10,
      pages: 2,
    });
    expect(await screen.findByText('Second page item')).toBeInTheDocument();
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

    expect(actionButtons).toHaveLength(2);
    expect(actionButtons[0]).toHaveAccessibleName('Download selected item labels');
    expect(actionButtons[0]).not.toHaveTextContent('Download');
    expect(actionButtons[1]).toHaveAccessibleName('Add Item');
    expect(actionButtons[1]).not.toHaveTextContent('Add Item');

    await user.click(actionButtons[0]);

    const menu = screen.getByRole('menu', {
      name: 'Download selected item labels',
    });
    expect(menu).toHaveClass('inventory-download__menu--compact');
    expect(within(menu).getByRole('menuitem', { name: 'XLSX' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'PDF' })).toBeInTheDocument();
    expect(within(menu).queryByText('Download as Excel file')).not.toBeInTheDocument();
    expect(within(menu).queryByText('Download as PDF file')).not.toBeInTheDocument();
    expect(menu.querySelector('.document-format-icon--xlsx')).not.toBeNull();
    expect(menu.querySelector('.document-format-icon--pdf')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(actionButtons[0]).toHaveFocus();

    await user.click(actionButtons[0]);
    await user.click(screen.getByRole('menuitem', { name: 'XLSX' }));

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

    expect(actionButtons).toHaveLength(2);
    expect(actionButtons[0]).toHaveAccessibleName('Add Item');
    expect(actionButtons[0]).toHaveTextContent('Add Item');
    expect(actionButtons[1]).toHaveAccessibleName('Download');

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
    expect(phoneActions[0]).toHaveAccessibleName('Download selected item labels');
    expect(phoneActions[1]).toHaveAccessibleName('Add Item');
  });
});
