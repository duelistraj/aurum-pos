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
    quoteWeightedItem: vi.fn(),
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

  it('quotes a weighted item in grams and adds one editable cart line', async () => {
    const weightedItem = {
      ...scannedItem,
      id: 'weighted-1',
      barcode: '87654321',
      name: 'Silver chain lot',
      stock_mode: 'weight' as const,
      pricing_method: 'fixed_making_charge' as const,
      stock_weight: 50,
      requires_weight: true,
      pricing: null,
    };
    const quotedItem = {
      ...weightedItem,
      pricing: {
        metal_value: 1250,
        making_charge: 25,
        suggested_price: 1275,
        subtotal: 1275,
        gst_rate_percent: 3,
        gst_amount: 38.25,
        final_price: 1313.25,
      },
    };
    vi.mocked(apiClient.getItemForPOS).mockResolvedValue(weightedItem);
    vi.mocked(apiClient.quoteWeightedItem).mockResolvedValue(quotedItem);
    const user = userEvent.setup();
    renderPOS();

    await user.type(screen.getByPlaceholderText('Scan or type barcode here...'), '87654321');
    await user.click(screen.getByRole('button', { name: 'Add barcode to cart' }));

    const dialog = await screen.findByRole('dialog', { name: 'Enter sale weight' });
    await user.type(screen.getByRole('spinbutton', { name: 'Weight to sell (g)' }), '12.5');
    await user.click(screen.getByRole('button', { name: 'Use weight' }));

    expect(apiClient.quoteWeightedItem).toHaveBeenCalledWith('weighted-1', 12.5);
    expect(await screen.findByText('Silver chain lot')).toBeInTheDocument();
    expect(screen.getByText(/12.5g sold by weight/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit grams' })).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  it('labels fixed and per-gram making charges explicitly in the cart', async () => {
    const fixedMakingChargeItem = {
      ...scannedItem,
      id: 'fixed-making-1',
      barcode: '11112222',
      name: 'Platinum Cufflink Pair',
      pricing_method: 'fixed_making_charge' as const,
    };
    const perGramMakingChargeItem = {
      ...scannedItem,
      id: 'per-gram-making-1',
      barcode: '33334444',
      name: 'Oxidized Silver Ring',
      pricing_method: 'making_charge_per_gram' as const,
    };
    vi.mocked(apiClient.getItemForPOS)
      .mockResolvedValueOnce(fixedMakingChargeItem)
      .mockResolvedValueOnce(perGramMakingChargeItem);
    const user = userEvent.setup();
    renderPOS();

    const barcodeInput = screen.getByPlaceholderText('Scan or type barcode here...');
    await user.type(barcodeInput, fixedMakingChargeItem.barcode);
    await user.click(screen.getByRole('button', { name: 'Add barcode to cart' }));
    await user.type(barcodeInput, perGramMakingChargeItem.barcode);
    await user.click(screen.getByRole('button', { name: 'Add barcode to cart' }));

    expect(await screen.findByText(
      'Base: ₹1000.00 + Fixed Making Charge: ₹100.00',
    )).toBeInTheDocument();
    expect(screen.getByText(
      'Base: ₹1000.00 + Making Charge: ₹100.00',
    )).toBeInTheDocument();
    expect(screen.queryByText(/\+ Making:/)).not.toBeInTheDocument();
  });
});
