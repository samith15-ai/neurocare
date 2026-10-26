import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.neurocare.app',
  appName: 'NeuroCare',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
  },
};

export default config;
