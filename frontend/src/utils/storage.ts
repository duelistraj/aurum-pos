import { Preferences } from '@capacitor/preferences';

const STORAGE_PREFIX = 'aurum-pos:v1:';

export const storageKey = (key: string): string => `${STORAGE_PREFIX}${key}`;

export const getLocalValue = (key: string): string | null => {
  try {
    const versionedKey = storageKey(key);
    const currentValue = window.localStorage.getItem(versionedKey);
    if (currentValue !== null) return currentValue;

    const legacyValue = window.localStorage.getItem(key);
    if (legacyValue !== null) window.localStorage.setItem(versionedKey, legacyValue);
    return legacyValue;
  } catch {
    return null;
  }
};

export const setLocalValue = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(storageKey(key), value);
  } catch {
    // Storage can be unavailable in private mode or when the quota is exhausted.
  }
};

export const removeLocalValue = (key: string): void => {
  try {
    window.localStorage.removeItem(storageKey(key));
    window.localStorage.removeItem(key);
  } catch {
    // Treat an unavailable storage backend as already cleared.
  }
};

export const getPreference = async (key: string): Promise<string | null> => {
  const versionedKey = storageKey(key);
  try {
    const { value } = await Preferences.get({ key: versionedKey });
    if (value !== null) return value;

    const legacy = await Preferences.get({ key });
    if (legacy.value !== null) {
      await Preferences.set({ key: versionedKey, value: legacy.value });
      return legacy.value;
    }
  } catch {
    return getLocalValue(key);
  }
  return getLocalValue(key);
};

export const setPreference = async (key: string, value: string): Promise<void> => {
  try {
    await Preferences.set({ key: storageKey(key), value });
  } catch {
    setLocalValue(key, value);
  }
};

export const removePreference = async (key: string): Promise<void> => {
  try {
    await Promise.all([
      Preferences.remove({ key: storageKey(key) }),
      Preferences.remove({ key }),
    ]);
  } catch {
    removeLocalValue(key);
  }
};
