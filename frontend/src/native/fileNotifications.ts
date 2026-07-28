import { registerPlugin } from '@capacitor/core';

export interface DownloadedFileNotificationResult {
  displayed: boolean;
}

interface AurumFileNotificationsPlugin {
  showDownloadedFile(options: { uri: string }): Promise<DownloadedFileNotificationResult>;
}

export const AurumFileNotifications =
  registerPlugin<AurumFileNotificationsPlugin>('AurumFileNotifications');
