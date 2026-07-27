import { Capacitor, registerPlugin } from '@capacitor/core';
import { getPreference, removePreference } from '../utils/storage';

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const AurumSecureStorage = registerPlugin<SecureStoragePlugin>('AurumSecureStorage');

export const getSecureValue = async (key: string): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return getPreference(key);
  const { value } = await AurumSecureStorage.get({ key });
  if (value !== null) return value;

  const legacyValue = await getPreference(key);
  if (legacyValue !== null) {
    await AurumSecureStorage.set({ key, value: legacyValue });
    await removePreference(key);
  }
  return legacyValue;
};

export const setSecureValue = async (key: string, value: string): Promise<void> => {
  if (!Capacitor.isNativePlatform()) {
    const { setPreference } = await import('../utils/storage');
    await setPreference(key, value);
    return;
  }
  await AurumSecureStorage.set({ key, value });
  await removePreference(key);
};

export const removeSecureValue = async (key: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await AurumSecureStorage.remove({ key });
  }
  await removePreference(key);
};
