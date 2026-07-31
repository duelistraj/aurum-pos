import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSecureValues,
  getSecureValue,
  setSecureValues,
} from '../native/secureStorage';
import {
  getPreference,
  removePreference,
  setPreference,
} from './storage';
import { AUTH_KEYS, setAuthData, subscribeAuthEvents } from './auth';

vi.mock('../native/secureStorage', () => ({
  clearSecureValues: vi.fn(),
  getSecureValue: vi.fn(),
  setSecureValues: vi.fn(),
}));

vi.mock('./storage', () => ({
  getPreference: vi.fn(),
  removePreference: vi.fn(),
  setPreference: vi.fn(),
}));

const userInfo = {
  full_name: 'Shop Owner',
  user_id: 'user-id',
  email: 'owner@example.com',
  memberships: [{
    shop_id: 'shop-id',
    organization_id: 'organization-id',
    organization_name: 'Test Organization',
    is_primary: true,
    access_mode: 'read_write' as const,
    shop_name: 'Test Shop',
    shop_slug: 'test-shop',
    role: 'OWNER' as const,
  }],
};

describe('authentication storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPreference).mockResolvedValue(null);
    vi.mocked(removePreference).mockResolvedValue();
    vi.mocked(setPreference).mockResolvedValue();
    vi.mocked(setSecureValues).mockResolvedValue();
    vi.mocked(clearSecureValues).mockResolvedValue();
    vi.mocked(getSecureValue).mockResolvedValue(null);
  });

  it('persists both tokens in one secure-storage operation before user state', async () => {
    await setAuthData('access-token', 'refresh-token', userInfo);

    expect(setSecureValues).toHaveBeenCalledOnce();
    expect(setSecureValues).toHaveBeenCalledWith({
      [AUTH_KEYS.ACCESS_TOKEN]: 'access-token',
      [AUTH_KEYS.REFRESH_TOKEN]: 'refresh-token',
    });
    expect(vi.mocked(setSecureValues).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(setPreference).mock.invocationCallOrder[0]);
    expect(setPreference).toHaveBeenCalledWith(
      AUTH_KEYS.USER_INFO,
      JSON.stringify(userInfo),
    );
    expect(setPreference).toHaveBeenCalledWith(AUTH_KEYS.ACTIVE_SHOP_ID, 'shop-id');
  });

  it('clears partial state and returns an actionable error when secure storage fails', async () => {
    vi.mocked(setSecureValues).mockRejectedValueOnce(new Error('Android Keystore failure'));

    await expect(setAuthData('access-token', 'refresh-token', userInfo)).rejects.toThrow(
      'Your account was authenticated, but this device could not securely save the session.',
    );

    expect(clearSecureValues).toHaveBeenCalledWith([
      AUTH_KEYS.ACCESS_TOKEN,
      AUTH_KEYS.REFRESH_TOKEN,
    ]);
    expect(removePreference).toHaveBeenCalledWith(AUTH_KEYS.USER_INFO);
    expect(removePreference).toHaveBeenCalledWith(AUTH_KEYS.ACTIVE_SHOP_ID);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it('clears this tab before applying a logout broadcast from another tab', async () => {
    const received = new Promise<void>((resolve) => {
      const unsubscribe = subscribeAuthEvents((event) => {
        expect(event).toBe('logout');
        unsubscribe();
        resolve();
      });
    });

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'aurum-pos-auth-v1',
      newValue: 'logout:other-tab',
    }));
    await received;

    expect(clearSecureValues).toHaveBeenCalledWith([
      AUTH_KEYS.ACCESS_TOKEN,
      AUTH_KEYS.REFRESH_TOKEN,
    ]);
    expect(removePreference).toHaveBeenCalledWith(AUTH_KEYS.USER_INFO);
    expect(removePreference).toHaveBeenCalledWith(AUTH_KEYS.ACTIVE_SHOP_ID);
  });
});
