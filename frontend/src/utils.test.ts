import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: false,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getUri: vi.fn(),
  writeFile: vi.fn(),
  downloadFile: vi.fn(),
  showDownloadedFile: vi.fn(),
  printPdf: vi.fn(),
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

vi.mock('./native/printing', () => ({
  AurumPrinting: {
    printPdf: mocks.printPdf,
  },
}));

import { downloadBlob, downloadInvoicePdf, downloadUrl, printInvoicePdf } from './utils';

describe('signed URL downloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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
    mocks.printPdf.mockReset().mockResolvedValue(undefined);
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

  it('downloads browser invoices from authenticated PDF bytes without navigating to S3', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.fn(() => 'blob:https://app.aurumpos.net/invoice');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const loadBrowserPdf = vi.fn(async () => new TextEncoder().encode('%PDF invoice').buffer);

    await downloadInvoicePdf(
      'https://invoice-bucket.example/signed',
      'INV-1.pdf',
      loadBrowserPdf,
    );

    expect(loadBrowserPdf).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:https://app.aurumpos.net/invoice');
    expect(anchor.href).not.toContain('invoice-bucket.example');
    expect(anchor.download).toBe('INV-1.pdf');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://app.aurumpos.net/invoice');
  });

  it('keeps native invoice downloads on signed URL transfer without proxying PDF bytes', async () => {
    mocks.isNative = true;
    const loadBrowserPdf = vi.fn(async () => new ArrayBuffer(8));

    await downloadInvoicePdf(
      'https://invoice-bucket.example/signed',
      'INV-1.pdf',
      loadBrowserPdf,
    );

    expect(loadBrowserPdf).not.toHaveBeenCalled();
    expect(mocks.downloadFile).toHaveBeenCalledWith({
      url: 'https://invoice-bucket.example/signed',
      path: 'file:///data/user/0/com.duelistraj.aurumpos/cache/invoice.pdf',
    });
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

  it('queues an exact app-cache PDF with Android printing without a download notification', async () => {
    mocks.isNative = true;
    const pdf = new TextEncoder().encode('%PDF invoice').buffer;

    await printInvoicePdf(pdf, 'INV-1.pdf');

    expect(mocks.writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: 'INV-1.pdf',
      directory: 'CACHE',
    }));
    expect(mocks.printPdf).toHaveBeenCalledWith({
      uri: 'file:///data/user/0/com.duelistraj.aurumpos/cache/invoice.pdf',
      jobName: 'INV-1.pdf',
    });
    expect(mocks.showDownloadedFile).not.toHaveBeenCalled();
  });

  it('loads browser invoice frames before opening the print dialog and cleans them up', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:https://app.aurumpos.net/print');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const printing = printInvoicePdf(
      new TextEncoder().encode('%PDF invoice').buffer,
      'INV-1.pdf',
    );
    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    const focus = vi.spyOn(frame!.contentWindow!, 'focus').mockImplementation(() => {});
    const print = vi.spyOn(frame!.contentWindow!, 'print').mockImplementation(() => {});

    frame!.dispatchEvent(new Event('load'));
    await printing;

    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    expect(frame).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(frame).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://app.aurumpos.net/print');
  });

  it('fails and cleans up when a browser invoice frame does not load', async () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:https://app.aurumpos.net/blocked-print'),
      revokeObjectURL,
    });
    const printing = printInvoicePdf(
      new TextEncoder().encode('%PDF invoice').buffer,
      'INV-2.pdf',
    );
    const failure = expect(printing).rejects.toThrow(
      'Unable to open the invoice for printing',
    );

    await vi.advanceTimersByTimeAsync(15_000);
    await failure;

    expect(document.querySelector('iframe')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith(
      'blob:https://app.aurumpos.net/blocked-print',
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
