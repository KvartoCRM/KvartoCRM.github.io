import { useEffect, useMemo, useState } from 'react'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { CheckCircle2, DownloadCloud, RefreshCw } from 'lucide-react'
import { ANDROID_APK_URL, APP_DOWNLOAD_MIRROR, WINDOWS_INSTALLER_URL } from '../lib/appDownloads'

interface PublishedVersion {
  version: string
  publishedAt?: string
}

const versionParts = (value: string) => value.replace(/^v/, '').split('.').map(part => Number(part) || 0)

const isNewerVersion = (available: string, current: string) => {
  const left = versionParts(available)
  const right = versionParts(current)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) > (right[index] || 0)) return true
    if ((left[index] || 0) < (right[index] || 0)) return false
  }
  return false
}

const InstalledAppPanel = () => {
  const [currentVersion, setCurrentVersion] = useState(__APP_VERSION__)
  const [published, setPublished] = useState<PublishedVersion | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const nativePlatform = Capacitor.getPlatform()
  const isElectron = navigator.userAgent.includes('Electron')

  useEffect(() => {
    let active = true
    const check = async () => {
      setChecking(true)
      setError('')
      try {
        if (Capacitor.isNativePlatform()) {
          const info = await App.getInfo()
          if (active) setCurrentVersion(info.version || __APP_VERSION__)
        }
        const response = await fetch(`${APP_DOWNLOAD_MIRROR}/version.json?at=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Сервер обновлений временно недоступен')
        const value = await response.json() as PublishedVersion
        if (active) setPublished(value)
      } catch (checkError) {
        if (active) setError(checkError instanceof Error ? checkError.message : 'Не удалось проверить обновление')
      } finally {
        if (active) setChecking(false)
      }
    }
    void check()
    return () => { active = false }
  }, [])

  const hasUpdate = useMemo(() => Boolean(published?.version && isNewerVersion(published.version, currentVersion)), [currentVersion, published])

  const installUpdate = async () => {
    if (nativePlatform === 'android') {
      await Browser.open({ url: ANDROID_APK_URL, presentationStyle: 'popover' })
      return
    }
    if (isElectron) {
      window.open(WINDOWS_INSTALLER_URL, '_blank', 'noopener,noreferrer')
      return
    }
    window.location.reload()
  }

  return (
    <section className="lumi-panel rounded-2xl border p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="lumi-control rounded-xl p-3"><RefreshCw className={`lumi-accent-text h-6 w-6 ${checking ? 'animate-spin' : ''}`} /></div>
          <div>
            <h2 className="lumi-text text-xl font-semibold">Обновления KvartoCRM</h2>
            <p className="lumi-muted mt-1 text-sm">Установлена версия {currentVersion}{published?.version ? ` · доступна ${published.version}` : ''}.</p>
            {!hasUpdate && !checking && !error && <p className="mt-2 flex items-center gap-2 text-sm text-emerald-500"><CheckCircle2 className="h-4 w-4" />Установлена актуальная версия</p>}
            {error && <p className="mt-2 text-sm text-amber-500">{error}. Проверка повторится при следующем запуске.</p>}
          </div>
        </div>
        {hasUpdate && (
          <button type="button" onClick={() => void installUpdate()} className="lumi-gradient-button inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold">
            <DownloadCloud className="h-5 w-5" />Обновить до {published?.version}
          </button>
        )}
      </div>
      <p className="lumi-muted mt-4 text-xs leading-5">
        {isElectron
          ? 'Windows-версия проверяет обновления автоматически и предложит перезапуск после загрузки.'
          : nativePlatform === 'android'
            ? 'Android установит новую версию поверх текущей — удалять приложение и данные не требуется.'
            : 'Web-приложение обновляется автоматически при следующем открытии.'}
      </p>
    </section>
  )
}

export default InstalledAppPanel
