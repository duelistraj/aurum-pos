import { Capacitor } from '@capacitor/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { getAccessToken } from '../utils/auth';
import { Login } from './Login';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
  },
}));
vi.mock('../api/client', () => ({
  apiClient: {
    authProviders: vi.fn(),
  },
}));
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../native/googleAuth', () => ({
  AurumGoogleAuth: { signIn: vi.fn() },
  createNonce: vi.fn(() => 'nonce-value-that-is-long-enough'),
}));
vi.mock('../utils/apiConfig', () => ({ isCloudDistribution: true }));
vi.mock('../utils/auth', () => ({
  getAccessToken: vi.fn(),
  setAuthData: vi.fn(),
}));
vi.mock('../utils/device', () => ({
  getDeviceInfo: vi.fn(() => ({
    device_name: 'Android Device',
    platform: 'android',
    app_version: '1.0',
  })),
  getDeviceUUID: vi.fn(async () => 'device-uuid'),
}));

const renderLogin = () => render(
  <MemoryRouter>
    <Login />
  </MemoryRouter>,
);

describe('Login Google provider discovery', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(getAccessToken).mockResolvedValue(null);
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: null,
      canManage: false,
      selectShop: vi.fn(),
      reload: vi.fn(async () => undefined),
    });
  });

  it('shows mode-specific Google actions from backend provider metadata', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: {
        enabled: true,
        client_id: 'google-client.apps.googleusercontent.com',
      },
    });

    renderLogin();

    expect(await screen.findByRole('button', { name: 'Sign in with Google' }))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New owner? Create a shop' }));
    expect(screen.getByRole('button', { name: 'Sign up with Google' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept a staff invitation' }));
    expect(screen.getByRole('button', { name: 'Join with Google' })).toBeInTheDocument();
  });

  it('keeps Google login out of the debug APK', () => {
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'false');

    renderLogin();

    expect(screen.queryByRole('button', { name: /Google/ })).not.toBeInTheDocument();
    expect(
      screen.getByText('Google Sign-In is available in Play test and release builds.'),
    ).toBeInTheDocument();
    expect(apiClient.authProviders).not.toHaveBeenCalled();
  });

  it('shows an explicit unavailable state when provider discovery fails', async () => {
    vi.mocked(apiClient.authProviders).mockRejectedValue(new Error('Backend unavailable'));

    renderLogin();

    expect(
      await screen.findByRole('button', { name: 'Google Sign-In unavailable' }),
    ).toBeDisabled();
  });
});
