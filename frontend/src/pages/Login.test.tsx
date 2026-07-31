import { Capacitor } from '@capacitor/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from '../api/client';
import { useShop } from '../context/ShopContext';
import { AurumGoogleAuth } from '../native/googleAuth';
import { setAuthData } from '../utils/auth';
import { Login } from './Login';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
    isNativePlatform: vi.fn(),
  },
}));
vi.mock('../api/client', () => {
  class MockApiError extends Error {
    readonly status?: number;
    readonly code?: string;
    readonly detail?: {
      code?: string;
      message?: string;
      email?: string;
      full_name?: string;
    };

    constructor(
      message: string,
      options: {
        status?: number;
        code?: string;
        detail?: {
          code?: string;
          message?: string;
          email?: string;
          full_name?: string;
        };
      } = {},
    ) {
      super(message);
      this.status = options.status;
      this.code = options.code;
      this.detail = options.detail;
    }
  }

  return {
    ApiError: MockApiError,
    apiClient: {
      acceptInvitation: vi.fn(),
      authProviders: vi.fn(),
      googleAuth: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      resendVerification: vi.fn(),
      restoreSession: vi.fn(),
      verifyEmail: vi.fn(),
    },
  };
});
vi.mock('../context/ShopContext', () => ({ useShop: vi.fn() }));
vi.mock('../native/googleAuth', () => ({
  AurumGoogleAuth: { signIn: vi.fn() },
  createNonce: vi.fn(() => 'nonce-value-that-is-long-enough'),
}));
vi.mock('../utils/apiConfig', () => ({
  getRecoveryPageUrl: vi.fn(async () => 'https://aurumpos.net/reset-password.html'),
  isCloudDistribution: true,
}));
vi.mock('../utils/auth', () => ({ setAuthData: vi.fn() }));
vi.mock('../utils/device', () => ({
  getDeviceInfo: vi.fn(() => ({
    device_name: 'Android Device',
    platform: 'android',
    app_version: '1.0',
  })),
  getDeviceUUID: vi.fn(async () => 'device-uuid'),
}));

const tokenResponse = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  full_name: 'Google Owner',
  user_id: 'user-id',
  email: 'owner@example.com',
  memberships: [{
    shop_id: 'shop-id',
    organization_id: 'organization-id',
    organization_name: 'Chosen Organization',
    is_primary: true,
    access_mode: 'read_write' as const,
    shop_name: 'Chosen Shop',
    shop_slug: 'chosen-shop',
    role: 'OWNER' as const,
  }],
};

const renderLogin = (initialEntry = '/login') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <Login />
  </MemoryRouter>,
);

describe('Login', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(apiClient.restoreSession).mockResolvedValue(false);
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: null,
      canManage: false,
      selectShop: vi.fn(),
      reload: vi.fn(async () => undefined),
    });
  });

  it('lets every password mode reveal the value and hides it again after switching modes', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: { enabled: false, client_id: null },
    });

    renderLogin();

    const loginPassword = screen.getByLabelText('Password');
    await user.type(loginPassword, 'visible-password');
    expect(loginPassword).toHaveAttribute('type', 'password');

    const showPassword = screen.getByRole('button', { name: 'Show password' });
    expect(showPassword).toHaveAttribute('aria-pressed', 'false');
    await user.click(showPassword);

    expect(loginPassword).toHaveAttribute('type', 'text');
    expect(loginPassword).toHaveValue('visible-password');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Create account' }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Password')).toHaveValue('visible-password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Have a staff invitation?' }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
  });

  it('opens account creation from the public website registration link', async () => {
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: { enabled: false, client_id: null },
    });

    renderLogin('/login?mode=register');

    expect(await screen.findByRole('tab', { name: 'Create account' }))
      .toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Create your shop' }))
      .toBeInTheDocument();
  });

  it('gives an invitation token precedence over registration mode', async () => {
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: { enabled: false, client_id: null },
    });

    renderLogin('/login?mode=register&token=staff-invitation');

    expect(await screen.findByRole('heading', { name: 'Join your team' }))
      .toBeInTheDocument();
    expect(screen.getByLabelText('Invitation code')).toHaveValue('staff-invitation');
  });

  it('uses one Google action across account and invitation modes', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: {
        enabled: true,
        client_id: 'google-client.apps.googleusercontent.com',
      },
    });

    renderLogin();

    expect(await screen.findByRole('button', { name: 'Continue with Google' }))
      .toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Have a staff invitation?' }));
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    expect(screen.queryByText('Sign up with Google')).not.toBeInTheDocument();
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

  it('asks a first-time Google user for a shop name and reuses the credential', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: {
        enabled: true,
        client_id: 'google-client.apps.googleusercontent.com',
      },
    });
    vi.mocked(AurumGoogleAuth.signIn).mockResolvedValue({ idToken: 'google-id-token' });
    vi.mocked(apiClient.googleAuth)
      .mockRejectedValueOnce(new ApiError('Choose a shop name to finish setup.', {
        status: 409,
        code: 'google_shop_required',
        detail: {
          code: 'google_shop_required',
          message: 'Choose a shop name to finish setup.',
          email: 'owner@example.com',
          full_name: 'Google Owner',
        },
      }))
      .mockResolvedValueOnce(tokenResponse);

    renderLogin();
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByRole('heading', { name: 'Name your shop' }))
      .toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Shop name'), 'Chosen Shop');
    await user.click(screen.getByRole('button', { name: 'Create shop' }));

    await waitFor(() => expect(apiClient.googleAuth).toHaveBeenCalledTimes(2));
    expect(apiClient.googleAuth).toHaveBeenLastCalledWith({
      id_token: 'google-id-token',
      nonce: 'nonce-value-that-is-long-enough',
      shop_name: 'Chosen Shop',
      device_uuid: 'device-uuid',
      device_name: 'Android Device',
      platform: 'android',
      app_version: '1.0',
    });
    expect(setAuthData).toHaveBeenCalledWith(
      'access-token',
      'refresh-token',
      expect.objectContaining({ email: 'owner@example.com' }),
    );
  });

  it('does not enter the app when password authentication cannot be stored securely', async () => {
    const user = userEvent.setup();
    const reload = vi.fn(async () => undefined);
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: null,
      canManage: false,
      selectShop: vi.fn(),
      reload,
    });
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: { enabled: false, client_id: null },
    });
    vi.mocked(apiClient.login).mockResolvedValue(tokenResponse);
    vi.mocked(setAuthData).mockRejectedValueOnce(new Error(
      'Your account was authenticated, but this device could not securely save the session.',
    ));

    renderLogin();
    await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
    await user.type(screen.getByLabelText('Password'), 'strong-password-123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(
      'Your account was authenticated, but this device could not securely save the session.',
    )).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not enter the app when Google authentication cannot be stored securely', async () => {
    const user = userEvent.setup();
    const reload = vi.fn(async () => undefined);
    vi.mocked(useShop).mockReturnValue({
      user: null,
      memberships: [],
      activeMembership: null,
      canManage: false,
      selectShop: vi.fn(),
      reload,
    });
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: {
        enabled: true,
        client_id: 'google-client.apps.googleusercontent.com',
      },
    });
    vi.mocked(AurumGoogleAuth.signIn).mockResolvedValue({ idToken: 'google-id-token' });
    vi.mocked(apiClient.googleAuth).mockResolvedValue(tokenResponse);
    vi.mocked(setAuthData).mockRejectedValueOnce(new Error(
      'Your account was authenticated, but this device could not securely save the session.',
    ));

    renderLogin();
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));

    expect(await screen.findByText(
      'Your account was authenticated, but this device could not securely save the session.',
    )).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows a verification-pending state after email registration', async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.authProviders).mockResolvedValue({
      google: { enabled: false, client_id: null },
    });
    vi.mocked(apiClient.register).mockResolvedValue({
      message: 'Check your email to verify your account',
    });

    renderLogin();
    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Full name'), 'Email Owner');
    await user.type(screen.getByLabelText('Shop name'), 'Email Shop');
    await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
    await user.type(screen.getByLabelText('Password'), 'strong-password-123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' }))
      .toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend available in 5:00/ }))
      .toBeDisabled();
    expect(apiClient.resendVerification).not.toHaveBeenCalled();
  });
});
