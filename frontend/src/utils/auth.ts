import { getPreference, removePreference, setPreference } from './storage';
import { getSecureValue, removeSecureValue, setSecureValue } from '../native/secureStorage';

export interface MembershipInfo {
  shop_id: string;
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
  const writes: Array<Promise<void>> = [
    setSecureValue(AUTH_KEYS.ACCESS_TOKEN, accessToken),
    setSecureValue(AUTH_KEYS.REFRESH_TOKEN, refreshToken),
    setPreference(AUTH_KEYS.USER_INFO, JSON.stringify(userInfo)),
  ];
  if (activeShopId) writes.push(setPreference(AUTH_KEYS.ACTIVE_SHOP_ID, activeShopId));
  await Promise.all(writes);
};

export const getAccessToken = (): Promise<string | null> =>
  getSecureValue(AUTH_KEYS.ACCESS_TOKEN);

export const getRefreshToken = (): Promise<string | null> =>
  getSecureValue(AUTH_KEYS.REFRESH_TOKEN);

export const getActiveShopId = (): Promise<string | null> =>
  getPreference(AUTH_KEYS.ACTIVE_SHOP_ID);

export const setActiveShopId = (shopId: string): Promise<void> =>
  setPreference(AUTH_KEYS.ACTIVE_SHOP_ID, shopId);

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
    removeSecureValue(AUTH_KEYS.ACCESS_TOKEN),
    removeSecureValue(AUTH_KEYS.REFRESH_TOKEN),
    removePreference(AUTH_KEYS.USER_INFO),
    removePreference(AUTH_KEYS.ACTIVE_SHOP_ID),
  ]);
};
