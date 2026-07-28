import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { Account } from './Account';

vi.mock('../api/client', () => ({
  apiClient: {
    requestAccountDeletion: vi.fn(),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));

describe('Account', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShop).mockReturnValue({
      user: {
        user_id: 'cashier-1',
        email: 'cashier@example.com',
        full_name: 'Cashier User',
        memberships: [{
          shop_id: 'shop-1',
          shop_name: 'Demo Shop',
          shop_slug: 'demo-shop',
          role: 'CASHIER',
        }],
      },
      memberships: [{
        shop_id: 'shop-1',
        shop_name: 'Demo Shop',
        shop_slug: 'demo-shop',
        role: 'CASHIER',
      }],
      activeMembership: {
        shop_id: 'shop-1',
        shop_name: 'Demo Shop',
        shop_slug: 'demo-shop',
        role: 'CASHIER',
      },
      canManage: false,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(apiClient.requestAccountDeletion).mockResolvedValue({
      message: 'If the account exists, a confirmation email has been sent',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('allows a cashier to request deletion of their own account', async () => {
    const user = userEvent.setup();
    render(<Account />);

    expect(screen.getByRole('heading', { name: 'Account deletion' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Request account deletion' }));

    await waitFor(() => {
      expect(apiClient.requestAccountDeletion).toHaveBeenCalledWith(
        'cashier@example.com',
        true,
      );
    });
    expect(screen.getByRole('alert')).toHaveTextContent('confirmation email has been sent');
  });
});
