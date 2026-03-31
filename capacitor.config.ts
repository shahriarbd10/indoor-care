import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shAhriar.indoorcare',
  appName: 'Indoor Care',
  webDir: 'public',
  server: {
    url: 'https://indoor-care.shahriarbd.com/',
    cleartext: true
  }
};

export default config;
