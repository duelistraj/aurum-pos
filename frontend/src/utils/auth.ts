import { getPreference, removePreference, setPreference } from './storage';
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

export const clearAuthData = async (): Promise<void> => {
  await Promise.all([
    clearSecureValues([AUTH_KEYS.ACCESS_TOKEN, AUTH_KEYS.REFRESH_TOKEN]),
    removePreference(AUTH_KEYS.USER_INFO),
    removePreference(AUTH_KEYS.ACTIVE_SHOP_ID),
  ]);
};
