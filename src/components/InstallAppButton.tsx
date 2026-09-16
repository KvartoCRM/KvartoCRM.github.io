import { useEffect, useState } from 'react'
import { Download, MonitorDown } from 'lucide-react'
import { ANDROID_APK_URL, detectAppPlatform, isInstalledApplication, WINDOWS_INSTALLER_URL } from '../lib/appDownloads'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface InstallAppButtonProps {
  compact?: boolean
}

const InstallAppButton = ({ compact = false }: InstallAppButtonProps) => {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(
    () => isInstalledApplication(),
  )
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstalled(true)
      setPrompt(null)
      setShowHint(false)
    }

    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (installed) return null

  const install = async () => {
    const platform = detectAppPlatform()
    if (platform === 'android') {
      window.location.assign(ANDROID_APK_URL)
      return
    }
    if (platform === 'windows') {
      window.location.assign(WINDOWS_INSTALLER_URL)
      return
    }
    if (!prompt) {
      setShowHint(value => !value)
      return
    }
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') setPrompt(null)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void install()}
        className="lumi-control inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition"
        aria-label="Установить KvartoCRM"
      >
        {compact ? <Download className="h-5 w-5" /> : <MonitorDown className="h-5 w-5" />}
        <span className={compact ? 'hidden sm:inline' : undefined}>{compact ? 'Скачать' : 'Скачать приложение'}</span>
      </button>
      {showHint && (
        <div className="lumi-theme-menu lumi-muted-strong absolute right-0 top-full z-50 mt-2 w-72 rounded-xl p-4 text-xs leading-5">
          На iPhone и iPad нажмите «Поделиться» → «На экран Домой». На других устройствах выберите в меню браузера «Установить KvartoCRM».
        </div>
      )}
    </div>
  )
}

export default InstallAppButton
