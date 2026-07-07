import { Preferences } from '@capacitor/preferences';

export const AUTH_KEYS = {
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  USER_INFO: 'user_info',
};

export const setAuthData = async (accessToken: string, refreshToken: string, userInfo: any) => {
  await Preferences.set({ key: AUTH_KEYS.ACCESS_TOKEN, value: accessToken });
  await Preferences.set({ key: AUTH_KEYS.REFRESH_TOKEN, value: refreshToken });
  await Preferences.set({ key: AUTH_KEYS.USER_INFO, value: JSON.stringify(userInfo) });
};

export const getAccessToken = async () => {
  const { value } = await Preferences.get({ key: AUTH_KEYS.ACCESS_TOKEN });
  return value;
};

export const getRefreshToken = async () => {
  const { value } = await Preferences.get({ key: AUTH_KEYS.REFRESH_TOKEN });
  return value;
};

export const getUserInfo = async () => {
  const { value } = await Preferences.get({ key: AUTH_KEYS.USER_INFO });
  return value ? JSON.parse(value) : null;
};

export const clearAuthData = async () => {
  await Preferences.remove({ key: AUTH_KEYS.ACCESS_TOKEN });
  await Preferences.remove({ key: AUTH_KEYS.REFRESH_TOKEN });
  await Preferences.remove({ key: AUTH_KEYS.USER_INFO });
};
