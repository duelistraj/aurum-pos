import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { Staff } from './Staff';

vi.mock('../api/client', () => ({
  apiClient: {
    inviteStaff: vi.fn(),
  },
}));

vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

describe('Staff', () => {
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
        role: 'OWNER',
      },
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(apiClient.inviteStaff).mockResolvedValue({
      id: 'invite-1',
      email: 'manager@example.com',
      role: 'MANAGER',
      expires_at: '2026-07-30T00:00:00Z',
      token: 'local-code',
    });
  });

  it('uses the app listbox and submits the selected role', async () => {
    const user = userEvent.setup();
    render(<Staff />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Role CASHIER' }));

    expect(screen.getByRole('listbox', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'CASHIER' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('option', { name: 'MANAGER' }));
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
});
