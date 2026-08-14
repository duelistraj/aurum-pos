import { Capacitor } from '@capacitor/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { POS } from './POS';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
    isNativePlatform: vi.fn(),
  },
}));
vi.mock('../api/client', () => ({
  apiClient: {
    getItemForPOS: vi.fn(),
    getWhatsAppCapability: vi.fn().mockResolvedValue({
      enabled: false,
      available: false,
      pro_required: true,
      sender_name: 'Aurum POS',
      template_status: 'unknown',
    }),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../utils', () => ({
  downloadUrl: vi.fn(),
  formatCurrency: (amount: number) => `₹${amount.toFixed(2)}`,
}));
vi.mock('../utils/checkout', () => ({
  clearCheckoutIdempotencyKey: vi.fn(async () => undefined),
  getCheckoutIdempotencyKey: vi.fn(),
}));

const membership = {
  shop_id: 'shop-1',
  organization_id: 'organization-1',
  organization_name: 'Demo Organization',
  is_primary: true,
  access_mode: 'read_write' as const,
  shop_name: 'Demo Shop',
  shop_slug: 'demo',
  role: 'OWNER' as const,
};

const scannedItem = {
  id: 'item-1',
  sku: 'SKU-1',
  barcode: '12345678',
  category: 'ring',
  name: 'Gold Ring',
  metal: 'Gold',
  purity: 91.6,
  net_weight: 5,
  quantity: 2,
  status: 'active',
  tax_rate_percent: 3,
  pricing: {
    metal_value: 1000,
    making_charge: 100,
    suggested_price: 1100,
    subtotal: 1100,
    gst_rate_percent: 3,
    gst_amount: 33,
    final_price: 1133,
  },
};

const renderPOS = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <POS />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('POS camera scanning', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.BarcodeDetector;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [membership],
      activeMembership: membership,
      canManage: true,
      selectShop: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
    });
  });

  it('shows the camera action only in Android builds', () => {
    const { unmount } = renderPOS();

    expect(
      screen.getByRole('button', { name: 'Scan barcode with camera' }),
    ).toBeInTheDocument();

    unmount();
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    renderPOS();

    expect(
      screen.queryByRole('button', { name: 'Scan barcode with camera' }),
    ).not.toBeInTheDocument();
  });

  it('disables the camera action for a read-only shop', () => {
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [{ ...membership, access_mode: 'read_only' }],
      activeMembership: { ...membership, access_mode: 'read_only' },
      canManage: false,
      selectShop: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
    });

    renderPOS();

    expect(
      screen.getByRole('button', { name: 'Scan barcode with camera' }),
    ).toBeDisabled();
  });

  it('shows an actionable error when barcode detection is unavailable', async () => {
    const user = userEvent.setup();
    renderPOS();

    await user.click(
      screen.getByRole('button', { name: 'Scan barcode with camera' }),
    );

    expect(
      await screen.findByText(
        'Camera barcode scanning is unavailable on this device. Update your browser or enter the barcode manually.',
      ),
    ).toBeInTheDocument();
    expect(apiClient.getItemForPOS).not.toHaveBeenCalled();
  });

  it('adds a detected item directly to the cart without populating the input', async () => {
    const stop = vi.fn();
    const detect = vi.fn(async () => [{ rawValue: '12345678' }]);
    class MockBarcodeDetector {
      detect = detect;
    }
    window.BarcodeDetector = MockBarcodeDetector;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop }],
        })),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'ended', 'get').mockReturnValue(false);
    vi.mocked(apiClient.getItemForPOS).mockResolvedValue(scannedItem);
    const user = userEvent.setup();
    renderPOS();

    await user.click(
      screen.getByRole('button', { name: 'Scan barcode with camera' }),
    );

    expect(await screen.findByText('Gold Ring')).toBeInTheDocument();
    expect(detect).toHaveBeenCalled();
    expect(apiClient.getItemForPOS).toHaveBeenCalledWith('12345678');
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(stop).toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Scan barcode with camera' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Cart Items (2)' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Scan barcode with camera' }),
    );
    expect(await screen.findByText('Item is out of stock')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Cart Items (2)' }),
    ).toBeInTheDocument();
    expect(apiClient.getItemForPOS).toHaveBeenCalledTimes(3);
  });
});
