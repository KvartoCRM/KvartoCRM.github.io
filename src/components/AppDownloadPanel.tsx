import { useEffect, useState } from 'react'
import { Download, Laptop, MonitorDown, Share2, Smartphone } from 'lucide-react'
import { ANDROID_APK_URL, APP_RELEASE_PAGE, detectAppPlatform, isInstalledApplication, type AppPlatform, WINDOWS_INSTALLER_URL } from '../lib/appDownloads'
import InstalledAppPanel from './InstalledAppPanel'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const platformCopy: Record<AppPlatform, { title: string; description: string }> = {
  android: { title: 'Android', description: 'APK с настоящей фиксацией вертикального экрана.' },
  windows: { title: 'Windows', description: 'Установщик создаст ярлык KvartoCRM на рабочем столе.' },
  ios: { title: 'iPhone или iPad', description: 'Автономная web-версия устанавливается через Safari.' },
  other: { title: 'Это устройство', description: 'Установите автономную web-версию KvartoCRM.' },
}

const AppDownloadPanel = () => {
  const [platform, setPlatform] = useState<AppPlatform>('other')
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [installed, setInstalled] = useState(() => isInstalledApplication())

  useEffect(() => {
    setPlatform(detectAppPlatform())
    setInstalled(isInstalledApplication())
    const handlePrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt)
  }, [])

  const installWebApp = async () => {
    if (!prompt) {
      setIosHint(true)
      return
    }
    await prompt.prompt()
    await prompt.userChoice
    setPrompt(null)
  }

  const primaryAction = platform === 'android'
    ? { href: ANDROID_APK_URL, label: 'Скачать APK', icon: Smartphone }
    : platform === 'windows'
      ? { href: WINDOWS_INSTALLER_URL, label: 'Скачать для Windows', icon: MonitorDown }
      : null

  const PrimaryIcon = primaryAction?.icon ?? Download

  if (installed) return <InstalledAppPanel />

  return (
    <section className="lumi-panel rounded-2xl border p-6">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="flex items-start gap-3">
          <div className="lumi-control rounded-xl p-3"><Download className="lumi-accent-text h-6 w-6" /></div>
          <div>
            <h2 className="lumi-text text-xl font-semibold">Скачать KvartoCRM</h2>
            <p className="lumi-muted mt-1 text-sm">Мы определили устройство: {platformCopy[platform].title}. {platformCopy[platform].description}</p>
          </div>
        </div>
        {primaryAction ? (
          <a href={primaryAction.href} className="lumi-gradient-button inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold">
            <PrimaryIcon className="h-5 w-5" />{primaryAction.label}
          </a>
        ) : (
          <button type="button" onClick={() => void installWebApp()} className="lumi-gradient-button inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold">
            <Download className="h-5 w-5" />Установить приложение
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <a href={ANDROID_APK_URL} className="lumi-panel-muted lumi-border rounded-2xl border p-4 transition hover:border-[var(--lumi-accent)]">
          <Smartphone className="lumi-accent-text h-6 w-6" />
          <p className="lumi-text mt-3 font-semibold">Android · APK</p>
          <p className="lumi-muted mt-1 text-sm leading-5">Скачивается одним нажатием. Android попросит подтвердить установку файла.</p>
        </a>
        <a href={WINDOWS_INSTALLER_URL} className="lumi-panel-muted lumi-border rounded-2xl border p-4 transition hover:border-[var(--lumi-accent)]">
          <Laptop className="lumi-accent-text h-6 w-6" />
          <p className="lumi-text mt-3 font-semibold">Windows · установщик</p>
          <p className="lumi-muted mt-1 text-sm leading-5">Устанавливает автономное приложение и создаёт ярлыки автоматически.</p>
        </a>
        <button type="button" onClick={() => void installWebApp()} className="lumi-panel-muted lumi-border rounded-2xl border p-4 text-left transition hover:border-[var(--lumi-accent)]">
          <Share2 className="lumi-accent-text h-6 w-6" />
          <p className="lumi-text mt-3 font-semibold">iPhone, iPad и web-приложение</p>
          <p className="lumi-muted mt-1 text-sm leading-5">Устанавливается на главный экран и сохраняет автономный режим.</p>
        </button>
      </div>

      {iosHint && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          На iPhone откройте KvartoCRM в Safari, нажмите «Поделиться», затем «На экран Домой». Apple не разрешает устанавливать APK на iPhone.
        </div>
      )}
      <p className="lumi-muted mt-4 text-xs leading-5">После скачивания система попросит подтвердить установку — браузер не может нажать это подтверждение вместо пользователя.</p>
      <p className="lumi-muted mt-2 text-xs leading-5">
        Если загрузка не началась, откройте{' '}
        <a className="lumi-accent-text underline" href={APP_RELEASE_PAGE} target="_blank" rel="noreferrer">
          резервную страницу выпуска
        </a>.
      </p>
    </section>
  )
}

export default AppDownloadPanel
