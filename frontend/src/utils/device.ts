import { Capacitor } from '@capacitor/core';
import {
  getLocalValue,
  getPreference,
  setLocalValue,
  setPreference,
} from './storage';
import { APP_VERSION } from './version';

export const DEVICE_UUID_KEY = 'device_uuid';
export const BROWSER_INSTALLATION_ID_KEY = 'browser_installation_id';

export const getDeviceUUID = async (): Promise<string> => {
  if (!Capacitor.isNativePlatform()) {
    const installationId = getLocalValue(BROWSER_INSTALLATION_ID_KEY);
    if (installationId) return installationId;

    const newInstallationId = crypto.randomUUID();
    setLocalValue(BROWSER_INSTALLATION_ID_KEY, newInstallationId);
    return newInstallationId;
  }

  const value = await getPreference(DEVICE_UUID_KEY);
  if (value) {
    return value;
  }
  
  // Generate a random UUID
  const newUuid = crypto.randomUUID();
  await setPreference(DEVICE_UUID_KEY, newUuid);
  return newUuid;
};

export const getDeviceInfo = () => {
  const nativePlatform = Capacitor.isNativePlatform();
  const platform = nativePlatform ? Capacitor.getPlatform() : 'web';
  return {
    platform,
    app_version: APP_VERSION,
    device_name: nativePlatform ? `${platform} Device` : 'Web browser',
  };
};
