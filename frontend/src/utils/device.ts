import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export const DEVICE_UUID_KEY = 'device_uuid';

export const getDeviceUUID = async (): Promise<string> => {
  const { value } = await Preferences.get({ key: DEVICE_UUID_KEY });
  if (value) {
    return value;
  }
  
  // Generate a random UUID
  const newUuid = crypto.randomUUID();
  await Preferences.set({ key: DEVICE_UUID_KEY, value: newUuid });
  return newUuid;
};

export const getDeviceInfo = () => {
  return {
    platform: Capacitor.getPlatform(),
    app_version: '0.1.0', // We might want to use @capacitor/app plugin later
    device_name: `${Capacitor.getPlatform()} Device`, // Ideally get from @capacitor/device
  };
};
