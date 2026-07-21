import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferenceValues = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: preferenceValues.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferenceValues.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferenceValues.delete(key);
    }),
  },
}));

import { getLocalValue, getPreference, removePreference, setPreference, storageKey } from './storage';

describe('versioned storage', () => {
  beforeEach(() => {
    preferenceValues.clear();
    window.localStorage.clear();
  });

  it('migrates legacy local storage values', () => {
    window.localStorage.setItem('theme', 'dark');
    expect(getLocalValue('theme')).toBe('dark');
    expect(window.localStorage.getItem(storageKey('theme'))).toBe('dark');
  });

  it('migrates, writes, and removes preference values', async () => {
    preferenceValues.set('access_token', 'legacy-token');
    expect(await getPreference('access_token')).toBe('legacy-token');
    expect(preferenceValues.get(storageKey('access_token'))).toBe('legacy-token');

    await setPreference('access_token', 'new-token');
    expect(await getPreference('access_token')).toBe('new-token');

    await removePreference('access_token');
    expect(await getPreference('access_token')).toBeNull();
  });
});
