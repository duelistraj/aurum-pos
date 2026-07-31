import { Capacitor, registerPlugin } from '@capacitor/core';
import { getPreference, removePreference } from '../utils/storage';

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  setMany(options: { values: Record<string, string> }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

const AurumSecureStorage = registerPlugin<SecureStoragePlugin>('AurumSecureStorage');
const browserSession = new Map<string, string>();

const clearLegacyBrowserValue = (key: string): void => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // The browser session is intentionally memory-only even if storage is unavailable.
  }
};

export const getSecureValue = async (key: string): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) {
    clearLegacyBrowserValue(key);
    return browserSession.get(key) ?? null;
  }
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
    browserSession.set(key, value);
    clearLegacyBrowserValue(key);
    await removePreference(key);
    return;
  }
  await AurumSecureStorage.set({ key, value });
  await removePreference(key);
};

export const setSecureValues = async (values: Record<string, string>): Promise<void> => {
  const entries = Object.entries(values);
  if (!Capacitor.isNativePlatform()) {
    entries.forEach(([key, value]) => {
      browserSession.set(key, value);
      clearLegacyBrowserValue(key);
    });
    await Promise.all(entries.map(([key]) => removePreference(key)));
    return;
  }
  await AurumSecureStorage.setMany({ values });
  await Promise.all(entries.map(([key]) => removePreference(key)));
};

export const removeSecureValue = async (key: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await AurumSecureStorage.remove({ key });
  } else {
    browserSession.delete(key);
    clearLegacyBrowserValue(key);
  }
  await removePreference(key);
};

export const clearSecureValues = async (keys: readonly string[]): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    await AurumSecureStorage.clear();
  } else {
    keys.forEach((key) => {
      browserSession.delete(key);
      clearLegacyBrowserValue(key);
    });
  }
  await Promise.all(keys.map((key) => removePreference(key)));
};
