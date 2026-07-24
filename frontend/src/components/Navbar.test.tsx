import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { Navbar } from './Navbar';

vi.mock('../api/client', () => ({
  apiClient: {
    getEntitlement: vi.fn(),
    logout: vi.fn(),
    version: vi.fn(),
  },
}));
vi.mock('../context/ConfigContext', () => ({ useConfig: vi.fn() }));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../utils/apiConfig', () => ({ isCloudDistribution: false }));

const memberships = [
  { shop_id: 'shop-1', shop_name: 'Demo Shop', shop_slug: 'demo', role: 'OWNER' as const },
  { shop_id: 'shop-2', shop_name: 'Second Shop', shop_slug: 'second', role: 'ADMIN' as const },
];
const selectShop = vi.fn<(shopId: string) => Promise<void>>();
const reloadShop = vi.fn<() => Promise<void>>();

const renderNavbar = (initialEntries = ['/'], collapsed = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Navbar
          collapsed={collapsed}
          mobileOpen={false}
          onToggleCollapsed={vi.fn()}
          onCloseMobile={vi.fn()}
        />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Navbar', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    selectShop.mockResolvedValue(undefined);
    reloadShop.mockResolvedValue(undefined);
    vi.mocked(apiClient.logout).mockResolvedValue(undefined);
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      plan: 'free',
      source: 'hosted_free',
      active_item_limit: 50,
      active_item_count: 12,
      can_add_item: true,
      expires_at: null,
    });
    vi.mocked(apiClient.version).mockResolvedValue({
      version: '0.1.0',
      revision: 'abc123',
      license: 'AGPL-3.0-only',
      source: 'https://github.com/duelistraj/aurum-pos/tree/abc123',
      deployment_mode: 'self_hosted',
    });
    vi.mocked(useConfig).mockReturnValue({
      appName: 'Aurum POS',
      isDarkMode: true,
      toggleDarkMode: vi.fn(),
    });
    vi.mocked(useShop).mockReturnValue({
      user: {
        full_name: 'Admin User',
        user_id: 'user-1',
        email: 'admin@example.com',
        memberships,
      },
      memberships,
      activeMembership: memberships[0],
      canManage: true,
      selectShop,
      reload: reloadShop,
    });
  });

  it('maps the primary navigation to the existing routes', () => {
    renderNavbar(['/history']);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', '/pos');
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/items');
    expect(screen.getByRole('link', { name: 'Metal Rates' })).toHaveAttribute('href', '/rates');
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/history');
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps shop switching in the sidebar footer', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Active shop' }));
    const shopMenu = screen.getByRole('listbox', { name: 'Shops' });
    expect(shopMenu).toBeInTheDocument();
    expect(shopMenu).toHaveClass('sidebar__shop-menu');
    expect(shopMenu).not.toHaveClass('sidebar__popover--collapsed');
    expect(screen.getByRole('option', { name: 'Demo Shop' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('option', { name: 'Second Shop' }));

    expect(selectShop).toHaveBeenCalledWith('shop-2');
  });

  it('opens shop menus from the side of a collapsed rail', async () => {
    const user = userEvent.setup();
    renderNavbar(['/'], true);

    await user.click(screen.getByRole('button', { name: 'Active shop' }));

    expect(screen.getByRole('listbox', { name: 'Shops' })).toHaveClass('sidebar__popover--collapsed');
  });

  it('keeps account actions in the sidebar menu and logs out', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Account and settings' }));

    expect(screen.getByRole('menu', { name: 'Account and settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Upgrade to Pro/ })).toHaveAttribute('href', '/subscription');
    expect(screen.getByRole('menuitem', { name: 'Manage staff' })).toHaveAttribute('href', '/staff');
    expect(screen.getByRole('menuitem', { name: 'Connect backend' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/duelistraj/aurum-pos/tree/abc123',
    );
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(apiClient.logout).toHaveBeenCalledOnce());
    expect(reloadShop).toHaveBeenCalledOnce();
  });
});
