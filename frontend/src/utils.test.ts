import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: false,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getUri: vi.fn(),
  downloadFile: vi.fn(),
  checkNotificationPermissions: vi.fn(),
  requestNotificationPermissions: vi.fn(),
  scheduleNotification: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.isNative,
  },
}));

vi.mock('@capacitor/file-transfer', () => ({
  FileTransfer: {
    downloadFile: mocks.downloadFile,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: {
    Documents: 'DOCUMENTS',
  },
  Filesystem: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    getUri: mocks.getUri,
  },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: mocks.checkNotificationPermissions,
    requestPermissions: mocks.requestNotificationPermissions,
    schedule: mocks.scheduleNotification,
  },
}));

import { downloadUrl } from './utils';

describe('signed URL downloads', () => {
  beforeEach(() => {
    mocks.isNative = false;
    mocks.checkPermissions.mockReset().mockResolvedValue({ publicStorage: 'granted' });
    mocks.requestPermissions.mockReset();
    mocks.getUri.mockReset().mockResolvedValue({ uri: 'file:///documents/invoice.pdf' });
    mocks.downloadFile.mockReset().mockResolvedValue({});
    mocks.checkNotificationPermissions.mockReset().mockResolvedValue({ display: 'granted' });
    mocks.requestNotificationPermissions.mockReset();
    mocks.scheduleNotification.mockReset().mockResolvedValue(undefined);
  });

  it('uses direct navigation for browser downloads', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadUrl('https://example.invalid/signed', 'invoice.pdf');

    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a')).toBeNull();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('https://example.invalid/signed');
    expect(anchor.download).toBe('invoice.pdf');
  });

  it('streams native downloads directly to the Documents directory', async () => {
    mocks.isNative = true;

    await downloadUrl('https://example.invalid/signed', 'invoice.pdf');

    expect(mocks.getUri).toHaveBeenCalledWith({
      path: 'invoice.pdf',
      directory: 'DOCUMENTS',
    });
    expect(mocks.downloadFile).toHaveBeenCalledWith({
      url: 'https://example.invalid/signed',
      path: 'file:///documents/invoice.pdf',
    });
    expect(mocks.scheduleNotification).toHaveBeenCalledOnce();
  });
});
