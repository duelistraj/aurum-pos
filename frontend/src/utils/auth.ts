import { getPreference, removePreference, setPreference } from './storage';

export const AUTH_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_INFO: 'user_info',
} as const;

export interface UserInfo {
  role: string;
  full_name: string;
  user_id: string;
}

export const setAuthData = async (
  accessToken: string,
  refreshToken: string,
  userInfo: UserInfo,
): Promise<void> => {
  await Promise.all([
    setPreference(AUTH_KEYS.ACCESS_TOKEN, accessToken),
    setPreference(AUTH_KEYS.REFRESH_TOKEN, refreshToken),
    setPreference(AUTH_KEYS.USER_INFO, JSON.stringify(userInfo)),
  ]);
};

export const getAccessToken = (): Promise<string | null> =>
  getPreference(AUTH_KEYS.ACCESS_TOKEN);

export const getRefreshToken = (): Promise<string | null> =>
  getPreference(AUTH_KEYS.REFRESH_TOKEN);

export const getUserInfo = async (): Promise<UserInfo | null> => {
  const value = await getPreference(AUTH_KEYS.USER_INFO);
  if (!value) return null;
  try {
    return JSON.parse(value) as UserInfo;
  } catch {
    return null;
  }
};

export const clearAuthData = async (): Promise<void> => {
  await Promise.all(Object.values(AUTH_KEYS).map(removePreference));
};
