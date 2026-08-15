import { Capacitor } from '@capacitor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceInfo } from './device';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
    isNativePlatform: vi.fn(),
  },
}));

describe('device information', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  it('reports the canonical application version', () => {
    expect(getDeviceInfo()).toEqual({
      platform: 'android',
      app_version: '0.3.0',
      device_name: 'android Device',
    });
  });

  it('uses a persistent installation ID instead of a hardware ID in the browser', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { getDeviceUUID } = await import('./device');

    const first = await getDeviceUUID();
    const second = await getDeviceUUID();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
    expect(getDeviceInfo()).toEqual({
      platform: 'web',
      app_version: '0.3.0',
      device_name: 'Web browser',
    });
  });
});
