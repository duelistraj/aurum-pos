import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: false,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getUri: vi.fn(),
  writeFile: vi.fn(),
  downloadFile: vi.fn(),
  showDownloadedFile: vi.fn(),
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
    Cache: 'CACHE',
    Documents: 'DOCUMENTS',
  },
  Filesystem: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    getUri: mocks.getUri,
    writeFile: mocks.writeFile,
  },
}));

vi.mock('./native/fileNotifications', () => ({
  AurumFileNotifications: {
    showDownloadedFile: mocks.showDownloadedFile,
  },
}));

import { downloadBlob, downloadUrl } from './utils';

describe('signed URL downloads', () => {
  beforeEach(() => {
    mocks.isNative = false;
    mocks.checkPermissions.mockReset().mockResolvedValue({ publicStorage: 'granted' });
    mocks.requestPermissions.mockReset();
    mocks.getUri.mockReset().mockResolvedValue({
      uri: 'file:///data/user/0/com.duelistraj.aurumpos/cache/invoice.pdf',
    });
    mocks.writeFile.mockReset().mockResolvedValue({
      uri: 'file:///data/user/0/com.duelistraj.aurumpos/cache/invoice.pdf',
    });
    mocks.downloadFile.mockReset().mockResolvedValue({});
    mocks.showDownloadedFile.mockReset().mockResolvedValue({ displayed: true });
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

  it('streams native downloads to app-private cache', async () => {
    mocks.isNative = true;

    await downloadUrl('https://example.invalid/signed', 'invoice.pdf');

    expect(mocks.getUri).toHaveBeenCalledWith({
      path: 'invoice.pdf',
      directory: 'CACHE',
    });
    expect(mocks.downloadFile).toHaveBeenCalledWith({
      url: 'https://example.invalid/signed',
      path: 'file:///data/user/0/com.duelistraj.aurumpos/cache/invoice.pdf',
    });
    expect(mocks.showDownloadedFile).toHaveBeenCalledWith({
      uri: 'file:///data/user/0/com.duelistraj.aurumpos/cache/invoice.pdf',
    });
    expect(mocks.showDownloadedFile.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.downloadFile.mock.invocationCallOrder[0],
    );
  });

  it('notifies with the exact URI returned after a native blob write', async () => {
    mocks.isNative = true;
    mocks.writeFile.mockResolvedValue({ uri: 'file:///documents/labels.xlsx' });

    await downloadBlob(new Blob(['labels']), 'labels.xlsx');

    expect(mocks.showDownloadedFile).toHaveBeenCalledWith({
      uri: 'file:///documents/labels.xlsx',
    });
    expect(mocks.showDownloadedFile.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.writeFile.mock.invocationCallOrder[0],
    );
  });

  it('does not report a completed download when native transfer fails', async () => {
    mocks.isNative = true;
    mocks.downloadFile.mockRejectedValue(new Error('transfer failed'));

    await expect(downloadUrl('https://example.invalid/signed', 'invoice.pdf')).rejects.toThrow(
      'transfer failed',
    );

    expect(mocks.showDownloadedFile).not.toHaveBeenCalled();
  });

  it('reports a native handoff failure instead of silently hiding the download', async () => {
    mocks.isNative = true;
    mocks.showDownloadedFile.mockRejectedValue(new Error('notifications disabled'));

    await expect(downloadUrl('https://example.invalid/signed', 'invoice.pdf')).rejects.toThrow(
      'notifications disabled',
    );
  });

  it('explains when Android notification permission prevents file access', async () => {
    mocks.isNative = true;
    mocks.showDownloadedFile.mockResolvedValue({ displayed: false });

    await expect(downloadUrl('https://example.invalid/signed', 'invoice.pdf')).rejects.toThrow(
      'Android notifications are disabled',
    );
  });
});
