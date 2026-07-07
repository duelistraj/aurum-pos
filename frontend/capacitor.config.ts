import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aurumpos.app',
  appName: 'Aurum POS',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
