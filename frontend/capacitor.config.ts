import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || 'com.duelistraj.aurumpos',
  appName: 'Aurum POS',
  webDir: 'dist',
  server: {
    cleartext: process.env.AURUM_DISTRIBUTION !== 'cloud'
  }
};

export default config;
