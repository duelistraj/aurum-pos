import { Capacitor } from '@capacitor/core';
import { FileTransfer } from '@capacitor/file-transfer';
import { Filesystem, Directory } from '@capacitor/filesystem';

import { AurumFileNotifications } from './native/fileNotifications';

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

const requestPublicStoragePermission = async () => {
  try {
    const fsPermission = await Filesystem.checkPermissions();
    if (fsPermission.publicStorage !== 'granted') {
      await Filesystem.requestPermissions();
    }
  } catch (permissionErr) {
    console.error('Error checking/requesting filesystem permissions:', permissionErr);
  }
};

const notifyFileDownloaded = async (uri: string) => {
  try {
    await AurumFileNotifications.showDownloadedFile({ uri });
  } catch (notificationErr) {
    console.error('Error showing downloaded file notification:', notificationErr);
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

      await requestPublicStoragePermission();

      const savedFile = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
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
    await requestPublicStoragePermission();
    const destination = await Filesystem.getUri({
      path: filename,
      directory: Directory.Documents,
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
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
