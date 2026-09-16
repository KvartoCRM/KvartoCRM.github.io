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
      // Native HTTP interception acknowledges task writes but may subsequently
      // hand WebView an outdated REST list. Let the authenticated WebView use
      // its normal HTTPS stack, matching the working browser client.
      enabled: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_launcher_foreground',
      iconColor: '#4161f5',
    },
  },
}

export default config
