import { getPreference, removePreference, setPreference } from './storage';
import { Capacitor } from '@capacitor/core';
import {
  clearSecureValues,
  getSecureValue,
  setSecureValues,
} from '../native/secureStorage';

export interface MembershipInfo {
  shop_id: string;
  organization_id: string;
  organization_name: string;
  is_primary: boolean;
  access_mode?: 'read_write' | 'read_only';
  shop_name: string;
  shop_slug: string;
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER';
}

export interface UserInfo {
  full_name: string;
  user_id: string;
  email: string;
  memberships: MembershipInfo[];
}

export const AUTH_KEYS = {
  ACCESS_TOKEN: 'aurum:v1:access_token',
  REFRESH_TOKEN: 'aurum:v1:refresh_token',
  USER_INFO: 'aurum:v1:user_info',
  ACTIVE_SHOP_ID: 'aurum:v1:active_shop_id',
} as const;

const AUTH_CHANNEL_NAME = 'aurum-pos-auth-v1';
type AuthEvent = 'logout' | 'session-expired';
type AuthEventListener = (event: AuthEvent) => void;
const authEventListeners = new Set<AuthEventListener>();
let authChannel: BroadcastChannel | null = null;

const getAuthChannel = (): BroadcastChannel | null => {
  if (Capacitor.isNativePlatform() || typeof BroadcastChannel === 'undefined') return null;
  authChannel ??= new BroadcastChannel(AUTH_CHANNEL_NAME);
  return authChannel;
};

const notifyAuthEventListeners = (event: AuthEvent) => {
  authEventListeners.forEach((listener) => listener(event));
};

const receiveAuthEvent = (event: AuthEvent): void => {
  void clearAuthData().finally(() => notifyAuthEventListeners(event));
};

if (typeof window !== 'undefined') {
  getAuthChannel()?.addEventListener('message', (message: MessageEvent<AuthEvent>) => {
    if (message.data === 'logout' || message.data === 'session-expired') {
      receiveAuthEvent(message.data);
    }
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH_CHANNEL_NAME || !event.newValue) return;
    const authEvent = event.newValue.split(':', 1)[0];
    if (authEvent === 'logout' || authEvent === 'session-expired') {
      receiveAuthEvent(authEvent);
    }
  });
}

export const subscribeAuthEvents = (listener: AuthEventListener): (() => void) => {
  authEventListeners.add(listener);
  return () => authEventListeners.delete(listener);
};

const broadcastAuthEvent = (event: AuthEvent): void => {
  if (Capacitor.isNativePlatform()) return;
  getAuthChannel()?.postMessage(event);
  try {
    window.localStorage.setItem(AUTH_CHANNEL_NAME, `${event}:${crypto.randomUUID()}`);
    window.localStorage.removeItem(AUTH_CHANNEL_NAME);
  } catch {
    // BroadcastChannel remains the primary notification mechanism.
  }
};

export const setAuthData = async (
  accessToken: string,
  refreshToken: string,
  userInfo: UserInfo,
): Promise<void> => {
  const currentShopId = await getPreference(AUTH_KEYS.ACTIVE_SHOP_ID);
  const activeShopId = userInfo.memberships.some(({ shop_id }) => shop_id === currentShopId)
    ? currentShopId
    : userInfo.memberships[0]?.shop_id ?? null;
  try {
    await setSecureValues({
      [AUTH_KEYS.ACCESS_TOKEN]: accessToken,
      ...(refreshToken ? { [AUTH_KEYS.REFRESH_TOKEN]: refreshToken } : {}),
    });
    if (!refreshToken) {
      await clearSecureValues([AUTH_KEYS.REFRESH_TOKEN]);
    }
    await setPreference(AUTH_KEYS.USER_INFO, JSON.stringify(userInfo));
    if (activeShopId) await setPreference(AUTH_KEYS.ACTIVE_SHOP_ID, activeShopId);
  } catch {
    try {
      await clearAuthData();
    } catch {
      // Preserve the actionable authentication error if best-effort cleanup also fails.
    }
    throw new Error(
      'Your account was authenticated, but this device could not securely save the session.',
    );
  }
};

export const getAccessToken = (): Promise<string | null> =>
  getSecureValue(AUTH_KEYS.ACCESS_TOKEN);

export const getRefreshToken = (): Promise<string | null> =>
  getSecureValue(AUTH_KEYS.REFRESH_TOKEN);

export const getActiveShopId = (): Promise<string | null> =>
  getPreference(AUTH_KEYS.ACTIVE_SHOP_ID);

export const setActiveShopId = (shopId: string): Promise<void> =>
  setPreference(AUTH_KEYS.ACTIVE_SHOP_ID, shopId);

export const clearActiveShopId = (): Promise<void> =>
  removePreference(AUTH_KEYS.ACTIVE_SHOP_ID);

export const getUserInfo = async (): Promise<UserInfo | null> => {
  const value = await getPreference(AUTH_KEYS.USER_INFO);
  if (!value) return null;
  try {
    return JSON.parse(value) as UserInfo;
  } catch {
    return null;
  }
};

export const setUserInfo = (userInfo: UserInfo): Promise<void> =>
  setPreference(AUTH_KEYS.USER_INFO, JSON.stringify(userInfo));

export const clearAuthData = async (
  options: { notify?: AuthEvent } = {},
): Promise<void> => {
  await Promise.all([
    clearSecureValues([AUTH_KEYS.ACCESS_TOKEN, AUTH_KEYS.REFRESH_TOKEN]),
    removePreference(AUTH_KEYS.USER_INFO),
    removePreference(AUTH_KEYS.ACTIVE_SHOP_ID),
  ]);
  if (options.notify) broadcastAuthEvent(options.notify);
};
