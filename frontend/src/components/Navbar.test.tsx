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

const memberships = [
  {
    shop_id: 'shop-1',
    organization_id: 'organization-1',
    organization_name: 'Demo Organization',
    is_primary: true,
    access_mode: 'read_write' as const,
    shop_name: 'Demo Shop',
    shop_slug: 'demo',
    role: 'OWNER' as const,
  },
  {
    shop_id: 'shop-2',
    organization_id: 'organization-1',
    organization_name: 'Demo Organization',
    is_primary: false,
    access_mode: 'read_write' as const,
    shop_name: 'Second Shop',
    shop_slug: 'second',
    role: 'ADMIN' as const,
  },
];
const selectShop = vi.fn<(shopId: string) => Promise<void>>();
const reloadShop = vi.fn<() => Promise<void>>();

const renderNavbar = (initialEntries = ['/'], collapsed = false, mobileOpen = false) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Navbar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
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
    });
    vi.mocked(apiClient.version).mockResolvedValue({
      version: '0.4.0',
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
    renderNavbar(['/transactions']);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', '/pos');
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/items');
    expect(screen.getByRole('link', { name: 'Metal Rates' })).toHaveAttribute('href', '/rates');
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics');
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the combined transactions destination available to lower-privilege staff', () => {
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [{ ...memberships[0], role: 'MANAGER' }],
      activeMembership: { ...memberships[0], role: 'MANAGER' },
      canManage: true,
      selectShop,
      reload: reloadShop,
    });

    renderNavbar();

    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
      'href',
      '/transactions',
    );
  });

  it('labels the combined workspace as transactions and omits plan data for cashiers', async () => {
    const cashierMembership = { ...memberships[0], role: 'CASHIER' as const };
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [cashierMembership],
      activeMembership: cashierMembership,
      canManage: false,
      selectShop,
      reload: reloadShop,
    });
    const user = userEvent.setup();

    renderNavbar();

    expect(screen.getByRole('link', { name: 'Transactions' })).toHaveAttribute('href', '/transactions');
    expect(screen.queryByRole('link', { name: 'Invoices' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Account and settings' }));
    expect(screen.queryByRole('menuitem', { name: /Pro/ })).not.toBeInTheDocument();
    await waitFor(() => expect(apiClient.getEntitlement).not.toHaveBeenCalled());
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

  it('keeps complete branding available in the collapsed rail without a handle', () => {
    renderNavbar(['/'], true);

    const logo = screen.getByRole('img', { name: 'Aurum' });
    expect(logo.closest('a')).toBeNull();
    expect(screen.getByText('Aurum POS')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Expand|Collapse) navigation$/ }))
      .not.toBeInTheDocument();
  });

  it('renders the complete Pro lockup in the open mobile drawer', async () => {
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      organization_id: 'organization-1',
      plan: 'pro',
      source: 'play',
      active_item_limit: null,
      active_item_count: 12,
      can_add_item: true,
      shop_limit: 3,
      shop_count: 1,
      team_seat_limit: 10,
      team_seat_usage: 1,
      can_create_shop: true,
      can_invite_member: true,
      access_mode: 'read_write',
      expires_at: '2026-08-29T00:00:00Z',
    });

    renderNavbar(['/'], true, true);

    expect(screen.getByText('Aurum POS')).toBeInTheDocument();
    expect(await screen.findByText('Pro')).toBeInTheDocument();
  });

  it('offers organization owners a second-shop form when their plan allows it', async () => {
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      organization_id: 'organization-1',
      plan: 'pro',
      source: 'play',
      active_item_limit: null,
      active_item_count: 12,
      can_add_item: true,
      shop_limit: 3,
      shop_count: 1,
      team_seat_limit: 10,
      team_seat_usage: 1,
      can_create_shop: true,
      can_invite_member: true,
      access_mode: 'read_write',
      expires_at: '2026-08-29T00:00:00Z',
    });
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Active shop' }));
    await user.click(screen.getByRole('button', { name: 'Add another shop' }));

    expect(screen.getByRole('dialog', { name: 'Add another shop' }))
      .toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Shop name' })).toBeInTheDocument();
  });

  it('keeps account actions in the sidebar menu and logs out', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await user.click(screen.getByRole('button', { name: 'Account and settings' }));

    expect(screen.getByRole('menu', { name: 'Account and settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Admin User admin@example.com/ })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByRole('menuitem', { name: /Upgrade to Pro/ })).toHaveAttribute('href', '/subscription');
    expect(screen.getByRole('menuitem', { name: 'Manage Shop' })).toHaveAttribute(
      'href',
      '/manage-shop',
    );
    expect(screen.queryByRole('menuitem', { name: 'Connect backend' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/duelistraj/aurum-pos/tree/abc123',
    );
    expect(screen.getByText('Version').parentElement).toHaveTextContent('Version0.4.0');
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(apiClient.logout).toHaveBeenCalledOnce());
    expect(reloadShop).toHaveBeenCalledOnce();
  });
});
