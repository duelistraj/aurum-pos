import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
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

      // Check and request Storage permission (required for public directories on Android)
      try {
        const fsPermission = await Filesystem.checkPermissions();
        if (fsPermission.publicStorage !== 'granted') {
          await Filesystem.requestPermissions();
        }
      } catch (permissionErr) {
        console.error('Error checking/requesting filesystem permissions:', permissionErr);
      }

      await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Documents,
      });

      // Check and request Notification permission (required for Android 13+) and display notification
      try {
        const notifyPermission = await LocalNotifications.checkPermissions();
        if (notifyPermission.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              title: 'File Downloaded',
              body: `${filename} has been saved to your Documents folder.`,
              id: Math.floor(Math.random() * 100000),
              schedule: { at: new Date(Date.now() + 500) },
            },
          ],
        });
      } catch (notificationErr) {
        console.error('Error scheduling local notification:', notificationErr);
      }
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

export const generateInvoiceNumber = (): string => {
  const timestamp = Date.now().toString();
  return `INV-${timestamp.slice(-8)}`;
};
