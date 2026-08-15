import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { ManageShop } from './Staff';

vi.mock('../api/client', () => ({
  apiClient: {
    getEntitlement: vi.fn(),
    inviteStaff: vi.fn(),
    listPendingInvitations: vi.fn(),
    listShops: vi.fn(),
    listStaff: vi.fn(),
    revokeInvitation: vi.fn(),
    transferOrganizationOwnership: vi.fn(),
    updateShop: vi.fn(),
    updateStaff: vi.fn(),
  },
}));

vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

const reload = vi.fn<() => Promise<void>>();

const renderManageShop = (initialEntry = '/manage-shop') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ManageShop />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Manage Shop', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    reload.mockResolvedValue(undefined);
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
        role: 'OWNER',
      },
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload,
    });
    vi.mocked(apiClient.inviteStaff).mockResolvedValue({
      id: 'invite-1',
      email: 'manager@example.com',
      role: 'MANAGER',
      expires_at: '2026-07-30T00:00:00Z',
      token: 'local-code',
    });
    vi.mocked(apiClient.listShops).mockResolvedValue([{
      id: 'shop-1',
      organization_id: 'organization-1',
      organization_name: 'Demo Organization',
      is_primary: true,
      access_mode: 'read_write',
      name: 'Demo Shop',
      slug: 'demo',
      role: 'OWNER',
      legal_name: 'Demo Shop Private Limited',
      tax_id: '19ABCDE1234F1Z5',
      phone: '+91 98765 43210',
      address: 'Kolkata',
      state: 'West Bengal',
      state_code: '19',
      invoice_prefix: 'INV',
      tax_rate_percent: 3,
    }]);
    vi.mocked(apiClient.listStaff).mockResolvedValue([
      {
        id: 'owner-membership',
        user_id: 'owner-user',
        email: 'owner@example.com',
        full_name: 'Current Owner',
        role: 'OWNER',
        is_active: true,
        created_at: '2026-07-20T00:00:00Z',
      },
      {
        id: 'manager-membership',
        user_id: 'manager-user',
        email: 'manager@example.com',
        full_name: 'Store Manager',
        role: 'MANAGER',
        is_active: true,
        created_at: '2026-07-21T00:00:00Z',
      },
    ]);
    vi.mocked(apiClient.listPendingInvitations).mockResolvedValue([]);
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
    vi.mocked(apiClient.transferOrganizationOwnership).mockResolvedValue({
      id: 'transfer-1',
      organization_id: 'organization-1',
      target_user_id: 'manager-user',
      status: 'pending',
      created_at: '2026-07-29T00:00:00Z',
      completed_at: null,
    });
    vi.mocked(apiClient.updateShop).mockResolvedValue({});
    vi.mocked(apiClient.updateStaff).mockResolvedValue({});
  });

  it('uses the app listbox and submits the selected role', async () => {
    const user = userEvent.setup();
    renderManageShop('/manage-shop?tab=staff');

    expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const memberRole = await screen.findByRole('button', { name: 'Role for Store Manager' });
    await user.click(memberRole);
    const memberRoleListbox = screen.getByRole('listbox', { name: 'Role for Store Manager' });
    expect(within(memberRoleListbox).queryByRole('option', { name: 'Select an option' }))
      .not.toBeInTheDocument();
    await user.click(within(memberRoleListbox).getByRole('option', { name: 'CASHIER' }));
    await waitFor(() => {
      expect(apiClient.updateStaff).toHaveBeenCalledWith('shop-1', 'manager-membership', {
        role: 'CASHIER',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Role CASHIER' }));

    const roleListbox = screen.getByRole('listbox', { name: 'Role' });
    expect(roleListbox).toBeInTheDocument();
    expect(within(roleListbox).getByRole('option', { name: 'CASHIER' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(roleListbox).getByRole('option', { name: 'MANAGER' }));
    expect(screen.getByRole('button', { name: 'Role MANAGER' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'manager@example.com');
    await user.click(screen.getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => {
      expect(apiClient.inviteStaff).toHaveBeenCalledWith('shop-1', {
        email: 'manager@example.com',
        role: 'MANAGER',
      });
    });
  });

  it('requires confirmation before transferring ownership', async () => {
    const user = userEvent.setup();
    renderManageShop('/manage-shop?tab=staff');

    await screen.findByText('Store Manager');
    const makeOwner = screen.getByRole('button', { name: 'Make owner' });
    expect(makeOwner).toHaveClass('staff-make-owner');
    await user.click(makeOwner);

    expect(screen.getByRole('dialog', { name: 'Transfer organization ownership' }))
      .toBeInTheDocument();
    expect(apiClient.transferOrganizationOwnership).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Begin transfer' }));
    await waitFor(() => {
      expect(apiClient.transferOrganizationOwnership).toHaveBeenCalledWith(
        'organization-1',
        'manager-membership',
      );
    });
  });

  it('opens invoice settings by default and saves changes', async () => {
    const user = userEvent.setup();
    renderManageShop();

    expect(screen.getByRole('tab', { name: 'Invoice Settings' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByDisplayValue('Demo Shop Private Limited')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByText('Enter a 10-digit Indian phone number.')).toBeInTheDocument();
    expect(apiClient.listStaff).not.toHaveBeenCalled();

    await user.clear(screen.getByRole('textbox', { name: 'Shop phone number' }));
    await user.type(screen.getByRole('textbox', { name: 'Shop phone number' }), '9876543210');
    await user.clear(screen.getByRole('textbox', { name: 'Invoice prefix' }));
    await user.type(screen.getByRole('textbox', { name: 'Invoice prefix' }), 'TAX');
    await user.click(screen.getByRole('button', { name: 'Save invoice settings' }));

    await waitFor(() => {
      expect(apiClient.updateShop).toHaveBeenCalledWith(
        'shop-1',
        expect.objectContaining({ invoice_prefix: 'TAX', phone: '9876543210' }),
      );
    });
  });

  it('blocks lower-privilege memberships', () => {
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
        role: 'MANAGER',
      },
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload,
    });

    renderManageShop();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only shop owners and administrators can manage shop settings.',
    );
    expect(apiClient.listShops).not.toHaveBeenCalled();
    expect(apiClient.listStaff).not.toHaveBeenCalled();
  });
});
