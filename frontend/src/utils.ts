import { Capacitor } from '@capacitor/core';
import { FileTransfer } from '@capacitor/file-transfer';
import { Filesystem, Directory } from '@capacitor/filesystem';

import { AurumFileNotifications } from './native/fileNotifications';
import { AurumPrinting } from './native/printing';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
};

export const formatWholeCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const formatWeight = (weight: number): string => {
  return `${weight.toFixed(2)}g`;
};

const notifyFileDownloaded = async (uri: string) => {
  const result = await AurumFileNotifications.showDownloadedFile({ uri });
  if (!result.displayed) {
    throw new Error(
      'The file was downloaded, but Android notifications are disabled. Allow notifications and try again.',
    );
  }
};

export const downloadBlob = async (data: Blob | ArrayBuffer, filename: string) => {
  if (Capacitor.isNativePlatform()) {
    try {
      let base64Data: string;
      if (data instanceof Blob) {
        base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(data);
        });
      } else {
        // Convert ArrayBuffer to Base64
        let binary = '';
        const bytes = new Uint8Array(data);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64Data = window.btoa(binary);
      }

      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });

      await notifyFileDownloaded(savedFile.uri);
    } catch (error) {
      console.error('Error saving file natively:', error);
      throw error;
    }
  } else {
    const blob = data instanceof Blob ? data : new Blob([data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
};

export const downloadUrl = async (url: string, filename: string) => {
  if (Capacitor.isNativePlatform()) {
    const destination = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });
    await FileTransfer.downloadFile({
      url,
      path: destination.uri,
    });
    await notifyFileDownloaded(destination.uri);
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadInvoicePdf = async (
  signedUrl: string,
  filename: string,
  loadBrowserPdf: () => Promise<ArrayBuffer>,
) => {
  if (Capacitor.isNativePlatform()) {
    await downloadUrl(signedUrl, filename);
    return;
  }

  const pdf = await loadBrowserPdf();
  await downloadBlob(pdf, filename);
};

const arrayBufferToBase64 = (data: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
};

export const printInvoicePdf = async (data: ArrayBuffer, filename: string) => {
  if (Capacitor.isNativePlatform()) {
    const savedFile = await Filesystem.writeFile({
      path: filename,
      data: arrayBufferToBase64(data),
      directory: Directory.Cache,
    });
    await AurumPrinting.printPdf({ uri: savedFile.uri, jobName: filename });
    return;
  }

  const blobUrl = window.URL.createObjectURL(
    new Blob([data], { type: 'application/pdf' }),
  );
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.title = `Print ${filename}`;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanupFailure = () => {
      frame.remove();
      window.URL.revokeObjectURL(blobUrl);
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(loadTimeout);
      cleanupFailure();
      reject(error);
    };
    const loadTimeout = window.setTimeout(() => {
      fail(new Error('Unable to open the invoice for printing'));
    }, 15_000);

    frame.onload = () => {
      if (settled) return;
      try {
        if (!frame.contentWindow) {
          fail(new Error('Unable to open the invoice for printing'));
          return;
        }
        frame.contentWindow.focus();
        frame.contentWindow.print();
        settled = true;
        window.clearTimeout(loadTimeout);
        resolve();
      } catch (error) {
        fail(error instanceof Error ? error : new Error('Unable to print the invoice'));
      }
    };
    frame.onerror = () => fail(new Error('Unable to open the invoice for printing'));
    frame.src = blobUrl;
    document.body.appendChild(frame);
  });
  window.setTimeout(() => {
    frame.remove();
    window.URL.revokeObjectURL(blobUrl);
  }, 60_000);
};
