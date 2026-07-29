import { Capacitor } from '@capacitor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceInfo } from './device';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
  },
}));

describe('device information', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
  });

  it('reports the canonical application version', () => {
    expect(getDeviceInfo()).toEqual({
      platform: 'android',
      app_version: '0.2.0',
      device_name: 'android Device',
    });
  });
});
