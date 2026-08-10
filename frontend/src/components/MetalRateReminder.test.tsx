import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { getPreference, setPreference } from '../utils/storage';
import { MetalRateReminder } from './MetalRateReminder';

vi.mock('../api/client', () => ({
  apiClient: { getAllMetalRates: vi.fn() },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../utils/storage', () => ({
  getPreference: vi.fn(),
  setPreference: vi.fn(),
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

const renderReminder = (path = '/') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <MetalRateReminder />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('MetalRateReminder', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-08T03:00:00.000Z'));
    vi.mocked(getPreference).mockResolvedValue(null);
    vi.mocked(setPreference).mockResolvedValue(undefined);
    vi.mocked(useShop).mockReturnValue({
      user: {
        full_name: 'Owner User',
        user_id: 'user-1',
        email: 'owner@example.com',
        memberships: [membership],
      },
      memberships: [membership],
      activeMembership: membership,
      canManage: true,
      selectShop: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('prompts once for configured rates that are stale after 8 AM IST', async () => {
    vi.mocked(apiClient.getAllMetalRates).mockResolvedValue([
      {
        metal: 'gold',
        purity: 100,
        rate_per_gram: 7_000,
        effective_from: '2026-08-07T18:29:59.000Z',
      },
      {
        metal: 'silver',
        purity: 100,
        rate_per_gram: 100,
        effective_from: '2026-08-07T18:30:00.000Z',
      },
    ]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReminder();

    const dialog = await screen.findByRole('dialog', { name: "Update today's metal rates" });
    expect(dialog).toHaveTextContent('configured Gold rate has not been updated today');
    await user.click(screen.getByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(setPreference).toHaveBeenCalledWith(
      'metal-rate-reminder:user-1:shop-1:2026-08-08',
      'acknowledged',
    ));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not prompt when there are no configured rates or while on the rates page', async () => {
    vi.mocked(apiClient.getAllMetalRates).mockResolvedValue([]);
    const firstRender = renderReminder();
    await waitFor(() => expect(apiClient.getAllMetalRates).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    firstRender.unmount();

    vi.mocked(apiClient.getAllMetalRates).mockResolvedValue([{
      metal: 'gold',
      purity: 100,
      rate_per_gram: 7_000,
      effective_from: '2026-08-07T18:29:59.000Z',
    }]);
    renderReminder('/rates');
    await waitFor(() => expect(apiClient.getAllMetalRates).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('checks again when an open app reaches 8 AM IST', async () => {
    vi.setSystemTime(new Date('2026-08-08T02:29:00.000Z'));
    vi.mocked(apiClient.getAllMetalRates).mockResolvedValue([{
      metal: 'silver',
      purity: 100,
      rate_per_gram: 100,
      effective_from: '2026-08-07T18:29:59.000Z',
    }]);
    renderReminder();

    await waitFor(() => expect(apiClient.getAllMetalRates).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    vi.advanceTimersByTime(61_100);

    expect(await screen.findByRole('dialog', { name: "Update today's metal rates" }))
      .toBeInTheDocument();
  });

  it('does not load or prompt for a user without rate-management access', async () => {
    vi.mocked(useShop).mockReturnValue({
      ...vi.mocked(useShop)(),
      canManage: false,
      activeMembership: { ...membership, role: 'CASHIER' },
    });
    renderReminder();

    await waitFor(() => expect(apiClient.getAllMetalRates).not.toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
