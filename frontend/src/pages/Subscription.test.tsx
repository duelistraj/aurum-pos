import { Capacitor } from '@capacitor/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { AurumBilling } from '../native/billing';
import { Subscription } from './Subscription';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
  },
  registerPlugin: vi.fn(),
}));
vi.mock('../api/client', () => ({
  apiClient: {
    getEntitlement: vi.fn(),
    submitPlayPurchase: vi.fn(),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../native/billing', () => ({
  PLAY_PRODUCT_ID: 'aurum_cloud_pro',
  AurumBilling: {
    getProducts: vi.fn(),
    purchase: vi.fn(),
    restore: vi.fn(),
  },
  sha256: vi.fn(async (value: string) => `hash-${value}`),
}));
vi.mock('../utils/apiConfig', () => ({ isCloudDistribution: true }));

const ownerMembership = {
  shop_id: 'shop-id',
  organization_id: 'organization-id',
  organization_name: 'BMR Chandiwala',
  is_primary: true,
  access_mode: 'read_write' as const,
  shop_name: 'BMR Chandiwala',
  shop_slug: 'bmr-chandiwala',
  role: 'OWNER' as const,
};

const renderSubscription = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Subscription />
    </QueryClientProvider>,
  );
};

describe('Subscription', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(apiClient.getEntitlement).mockResolvedValue({
      organization_id: 'organization-id',
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
    vi.mocked(useShop).mockReturnValue({
      user: {
        user_id: 'user-id',
        email: 'owner@example.com',
        full_name: 'Owner',
        memberships: [ownerMembership],
      },
      memberships: [ownerMembership],
      activeMembership: ownerMembership,
      canManage: true,
      selectShop: vi.fn(),
      reload: vi.fn(async () => undefined),
    });
  });

  it('shows an explicit unavailable state when Play returns no product', async () => {
    vi.mocked(AurumBilling.getProducts).mockResolvedValue({ products: [] });

    renderSubscription();

    expect(await screen.findByText('Pro is not available yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Choose/ })).not.toBeInTheDocument();
  });

  it('renders localized monthly and yearly plans with renewal disclosure', async () => {
    vi.mocked(AurumBilling.getProducts).mockResolvedValue({
      products: [{
        productId: 'aurum_cloud_pro',
        title: 'Aurum Cloud Pro',
        description: 'Unlimited active inventory',
        offers: [
          {
            basePlanId: 'monthly',
            offerToken: 'monthly-token',
            formattedPrice: '₹499.00',
            billingPeriod: 'P1M',
          },
          {
            basePlanId: 'yearly',
            offerToken: 'yearly-token',
            formattedPrice: '₹4,999.00',
            billingPeriod: 'P1Y',
          },
        ],
      }],
    });

    renderSubscription();

    expect(await screen.findByRole('button', { name: 'Choose Monthly' }))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose Yearly' })).toBeInTheDocument();
    expect(screen.getByText('₹499.00')).toBeInTheDocument();
    expect(screen.getByText('₹4,999.00')).toBeInTheDocument();
    expect(screen.getAllByText(/Renews automatically/)).toHaveLength(2);
  });

  it('submits a purchase for the selected organization', async () => {
    const user = userEvent.setup();
    vi.mocked(AurumBilling.getProducts).mockResolvedValue({
      products: [{
        productId: 'aurum_cloud_pro',
        title: 'Aurum Cloud Pro',
        description: 'Unlimited active inventory',
        offers: [{
          basePlanId: 'monthly',
          offerToken: 'monthly-token',
          formattedPrice: '₹499.00',
          billingPeriod: 'P1M',
        }],
      }],
    });
    vi.mocked(AurumBilling.purchase).mockResolvedValue({
      purchaseToken: 'purchase-token',
      purchaseState: 1,
      acknowledged: false,
    });

    renderSubscription();
    await user.click(await screen.findByRole('button', { name: 'Choose Monthly' }));

    expect(AurumBilling.purchase).toHaveBeenCalledWith({
      productId: 'aurum_cloud_pro',
      basePlanId: 'monthly',
      obfuscatedAccountId: 'hash-user-id',
      obfuscatedProfileId: 'hash-organization-id',
    });
    expect(apiClient.submitPlayPurchase).toHaveBeenCalledWith('purchase-token');
  });

  it('does not query products for non-owners', async () => {
    const membership = { ...ownerMembership, role: 'MANAGER' as const };
    vi.mocked(useShop).mockReturnValue({
      user: {
        user_id: 'user-id',
        email: 'manager@example.com',
        full_name: 'Manager',
        memberships: [membership],
      },
      memberships: [membership],
      activeMembership: membership,
      canManage: true,
      selectShop: vi.fn(),
      reload: vi.fn(async () => undefined),
    });

    renderSubscription();

    expect(await screen.findByText('Owner access required')).toBeInTheDocument();
    expect(AurumBilling.getProducts).not.toHaveBeenCalled();
  });

  it('keeps account deletion out of the shop plan page', async () => {
    vi.mocked(AurumBilling.getProducts).mockResolvedValue({ products: [] });

    renderSubscription();

    expect(await screen.findByText('Pro is not available yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request account deletion' }))
      .not.toBeInTheDocument();
  });
});
