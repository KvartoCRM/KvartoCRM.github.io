export const APP_DOWNLOAD_MIRROR = 'https://kvartocrm.github.io/downloads'
export const APP_RELEASE_PAGE = 'https://github.com/KvartoCRM/KvartoCRM.github.io/releases/latest'
export const ANDROID_APK_URL = `${APP_DOWNLOAD_MIRROR}/KvartoCRM-Android.apk`
export const WINDOWS_INSTALLER_URL = `${APP_DOWNLOAD_MIRROR}/KvartoCRM-Windows-Setup.exe`

export type AppPlatform = 'android' | 'ios' | 'windows' | 'other'

export const detectAppPlatform = (): AppPlatform => {
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('android')) return 'android'
  if (/iphone|ipad|ipod/.test(userAgent)) return 'ios'
  if (userAgent.includes('windows')) return 'windows'
  return 'other'
}

export const isInstalledApplication = () => {
  const nativeWindow = window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }
  return window.matchMedia('(display-mode: standalone)').matches
    || navigator.userAgent.includes('Electron')
    || nativeWindow.Capacitor?.isNativePlatform?.() === true
}
