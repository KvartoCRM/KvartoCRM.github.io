import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lumicrm.office',
  // Keep the legacy appId so existing Android installs update in place.
  appName: 'KvartoCRM',
  webDir: 'dist',
  android: {
    backgroundColor: '#070b14',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#4161f5',
    },
  },
}

export default config
