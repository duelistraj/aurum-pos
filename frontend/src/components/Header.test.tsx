import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useConfig } from '../context/ConfigContext';
import { useShop } from '../context/ShopContext';
import { Header } from './Header';

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
  { shop_id: 'shop-1', shop_name: 'Demo Shop', shop_slug: 'demo', role: 'OWNER' as const },
  { shop_id: 'shop-2', shop_name: 'Second Shop', shop_slug: 'second', role: 'ADMIN' as const },
];
const selectShop = vi.fn<(shopId: string) => Promise<void>>();
const reloadShop = vi.fn<() => Promise<void>>();

const renderHeader = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Header />
        <Routes>
          <Route path="/login" element={<div>Login destination</div>} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Header', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    selectShop.mockResolvedValue(undefined);
    reloadShop.mockResolvedValue(undefined);
    vi.mocked(apiClient.logout).mockResolvedValue(undefined);
    vi.mocked(useConfig).mockReturnValue({
      appName: 'Aurum POS',
      isDarkMode: true,
      toggleDarkMode: vi.fn(),
    });
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships,
      activeMembership: memberships[0],
      canManage: true,
      selectShop,
      reload: reloadShop,
    });
    vi.mocked(apiClient.version).mockResolvedValue({
      version: '0.1.0',
      revision: 'abc123',
      license: 'AGPL-3.0-only',
      source: 'https://github.com/duelistraj/aurum-pos/tree/abc123',
      deployment_mode: 'self_hosted',
    });
  });

  it('uses a custom listbox to switch shops', async () => {
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      plan: 'free',
      source: 'hosted_free',
      active_item_limit: 50,
      active_item_count: 12,
      can_add_item: true,
      expires_at: null,
    });
    const user = userEvent.setup();
    renderHeader();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Active shop' }));

    expect(screen.getByRole('listbox', { name: 'Shops' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Demo Shop' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('option', { name: 'Second Shop' }));
    expect(selectShop).toHaveBeenCalledWith('shop-2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows Pro in the title and keeps plan, backend, and source in Settings', async () => {
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      plan: 'pro',
      source: 'self_hosted',
      active_item_limit: null,
      active_item_count: 120,
      can_add_item: true,
      expires_at: null,
    });
    const user = userEvent.setup();
    renderHeader();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Aurum POS Pro' })).toBeInTheDocument();
    });
    expect(screen.getByText('Pro').tagName).toBe('SUP');
    expect(screen.queryByText('Aurum Pro')).not.toBeInTheDocument();

    const settingsButton = screen.getByRole('button', { name: 'Settings' });
    await user.click(settingsButton);

    expect(screen.getByRole('menu', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Aurum Pro/ })).toHaveAttribute(
      'href',
      '/subscription',
    );
    expect(screen.getByRole('menuitem', { name: 'Connect backend' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'View source on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/duelistraj/aurum-pos/tree/abc123',
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Settings' })).not.toBeInTheDocument();
    expect(settingsButton).toHaveFocus();
  });

  it('keeps free usage inside Settings without adding a title suffix', async () => {
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      plan: 'free',
      source: 'hosted_free',
      active_item_limit: 50,
      active_item_count: 12,
      can_add_item: true,
      expires_at: null,
    });
    const user = userEvent.setup();
    renderHeader();

    expect(screen.getByRole('heading', { name: 'Aurum POS' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(await screen.findByText('Upgrade to Pro')).toBeInTheDocument();
    expect(screen.getByText('12/50 active items')).toBeInTheDocument();
  });

  it('logs out immediately from Settings even when server revocation fails', async () => {
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      plan: 'pro',
      source: 'self_hosted',
      active_item_limit: null,
      active_item_count: 120,
      can_add_item: true,
      expires_at: null,
    });
    vi.mocked(apiClient.logout).mockRejectedValueOnce(new Error('Backend unavailable'));
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => expect(apiClient.logout).toHaveBeenCalledOnce());
    expect(reloadShop).toHaveBeenCalledOnce();
    expect(screen.getByText('Login destination')).toBeInTheDocument();
  });
});
