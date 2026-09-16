import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Cloud, CloudOff, HardDriveDownload, RefreshCw, Wifi } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { flushOfflineQueue, getOfflineQueueCount, getOfflineQueueIssues, type OfflineQueueIssue, type OfflineStatus } from '../lib/offlineTransport'
import { flushOfflineFiles, getOfflineFileQueueCount, prefetchCrmFiles } from '../lib/offlineFiles'
import { checkCloudConnection, checkCloudSession, supabase, warmOfflineWorkspace } from '../lib/supabase'
import { describeQueueIssue } from '../lib/syncDiagnostics'
import AnchoredPopover from './AnchoredPopover'

const getDeviceId = () => {
  const key = 'lumicrm-device-id'
  const current = localStorage.getItem(key)
  if (current) return current
  const created = crypto.randomUUID()
  localStorage.setItem(key, created)
  return created
}

const lastSyncKey = (userId: string) => `lumicrm-last-cloud-sync:${userId}`

const OfflineSyncStatus = () => {
  const { user } = useAuth()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cloudOnlineRef = useRef(navigator.onLine)
  const delayedOfflineRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<OfflineStatus>({ online: navigator.onLine, pending: 0, syncing: navigator.onLine })
  const [issues, setIssues] = useState<OfflineQueueIssue[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => user ? Number(localStorage.getItem(lastSyncKey(user.id)) || 0) || null : null)

  const rememberSuccessfulSync = useCallback(() => {
    if (!user) return
    const value = Date.now()
    localStorage.setItem(lastSyncKey(user.id), String(value))
    setLastSyncedAt(value)
  }, [user])

  const refresh = useCallback(async () => {
    if (!user) return 0
    const [dataPending, filePending, queueIssues] = await Promise.all([
      getOfflineQueueCount(user.id),
      getOfflineFileQueueCount(user.id),
      getOfflineQueueIssues(user.id),
    ])
    const pending = dataPending + filePending
    setIssues(queueIssues)
    setStatus(previous => ({ ...previous, pending }))
    return pending
  }, [user])

  const synchronize = useCallback(async (forceWarm = false) => {
    if (!user) return
    setStatus(previous => ({ ...previous, syncing: true, error: undefined }))
    try {
      const cloudSession = await checkCloudSession(user.id)
      if (!cloudSession.valid) {
        cloudOnlineRef.current = false
        const pending = await refresh()
        const cloudAvailable = cloudSession.kind === 'network' ? await checkCloudConnection() : true
        setStatus(previous => ({
          ...previous,
          online: false,
          pending,
          syncing: false,
          error: cloudSession.kind === 'network' && !cloudAvailable
            ? 'Интернет есть, но сервер KvartoCRM не отвечает'
            : cloudSession.message,
        }))
        return
      }
      cloudOnlineRef.current = true
      await flushOfflineQueue()
      await flushOfflineFiles(user.id)
      await warmOfflineWorkspace(user.id, forceWarm)
      window.dispatchEvent(new CustomEvent('lumicrm:workspace-refreshed'))
      const pending = await refresh()
      if (navigator.onLine && cloudOnlineRef.current && pending === 0) {
        setStatus(previous => ({ ...previous, online: true, pending: 0, syncing: false, error: undefined }))
        rememberSuccessfulSync()
      } else {
        setStatus(previous => ({ ...previous, syncing: false }))
      }
    } catch (syncError) {
      setStatus(previous => ({
        ...previous,
        online: false,
        syncing: false,
        error: syncError instanceof Error ? syncError.message : 'Не удалось связаться с сервисом',
      }))
    }
  }, [refresh, rememberSuccessfulSync, user])

  useEffect(() => {
    if (!user) return
    setLastSyncedAt(Number(localStorage.getItem(lastSyncKey(user.id)) || 0) || null)
    void refresh()
    if (navigator.onLine) void synchronize()

    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<OfflineStatus>).detail
      if (detail.online) {
        if (delayedOfflineRef.current !== null) window.clearTimeout(delayedOfflineRef.current)
        delayedOfflineRef.current = null
        cloudOnlineRef.current = true
        setStatus(previous => ({ ...previous, ...detail }))
        if (!detail.syncing && detail.pending === 0 && !detail.error) rememberSuccessfulSync()
      } else {
        if (delayedOfflineRef.current !== null) window.clearTimeout(delayedOfflineRef.current)
        delayedOfflineRef.current = window.setTimeout(() => {
          cloudOnlineRef.current = false
          setStatus(previous => ({ ...previous, ...detail }))
          delayedOfflineRef.current = null
        }, 1_500)
      }
      void refresh()
    }
    const handleOnline = () => void synchronize(true)
    const handleOffline = () => {
      cloudOnlineRef.current = false
      setStatus(previous => ({ ...previous, online: false, syncing: false, error: 'Нет подключения к интернету' }))
    }
    window.addEventListener('lumicrm:offline-status', handleStatus)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('lumicrm:offline-files-changed', refresh)
    const syncTimer = window.setInterval(() => {
      if (navigator.onLine) void synchronize()
    }, 60_000)

    const deviceId = getDeviceId()
    const channel = supabase
      .channel(`lumicrm-sync:${user.id}`)
      .on('broadcast', { event: 'data-synced' }, ({ payload }) => {
        if (payload?.deviceId === deviceId) return
        window.dispatchEvent(new CustomEvent('lumicrm:remote-data-changed'))
      })
      .subscribe()

    const announceSync = (event: Event) => {
      const detail = (event as CustomEvent<{ synced?: number }>).detail
      void channel.send({
        type: 'broadcast',
        event: 'data-synced',
        payload: { deviceId, synced: detail?.synced ?? 0, at: Date.now() },
      })
    }
    window.addEventListener('lumicrm:data-synced', announceSync)

    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const canPrefetchFiles = window.matchMedia('(min-width: 768px)').matches
      && !connection?.saveData
      && (!connection?.effectiveType || connection.effectiveType === '4g')
    let prefetchHandle = 0
    if (canPrefetchFiles) {
      const idleWindow = window as Window & { requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number }
      prefetchHandle = idleWindow.requestIdleCallback
        ? idleWindow.requestIdleCallback(() => void prefetchCrmFiles(user.id), { timeout: 15_000 })
        : window.setTimeout(() => void prefetchCrmFiles(user.id), 12_000)
    }

    return () => {
      window.removeEventListener('lumicrm:offline-status', handleStatus)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('lumicrm:offline-files-changed', refresh)
      window.removeEventListener('lumicrm:data-synced', announceSync)
      window.clearInterval(syncTimer)
      if (delayedOfflineRef.current !== null) window.clearTimeout(delayedOfflineRef.current)
      if (prefetchHandle) {
        const idleWindow = window as Window & { cancelIdleCallback?: (handle: number) => void }
        if (idleWindow.cancelIdleCallback) idleWindow.cancelIdleCallback(prefetchHandle)
        else window.clearTimeout(prefetchHandle)
      }
      void supabase.removeChannel(channel)
    }
  }, [refresh, rememberSuccessfulSync, synchronize, user])

  if (!user) return null

  const sessionProblem = Boolean(status.error?.includes('сессия') || status.error?.includes('Профиль'))
  const state = !navigator.onLine || !status.online
    ? 'offline'
    : status.syncing || status.pending > 0 ? 'syncing' : 'synced'
  const Icon = state === 'offline' ? CloudOff : state === 'syncing' ? RefreshCw : Check
  const label = state === 'offline'
    ? sessionProblem ? 'Требуется вход' : 'Локальная копия'
    : state === 'syncing' ? status.pending ? `В очереди: ${status.pending}` : 'Проверяем связь' : 'Синхронизировано'
  const buttonLabel = state === 'offline'
    ? sessionProblem ? 'Нужен вход' : 'Нет связи'
    : state === 'syncing' ? status.pending ? `В очереди: ${status.pending}` : 'Проверка' : 'В облаке'
  const iconClass = state === 'offline' ? 'text-amber-400' : state === 'syncing' ? 'text-sky-400' : 'text-emerald-400'

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-label={`Состояние синхронизации: ${label}`} title={label} className="lumi-control inline-flex w-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs xl:w-36">
        <Icon className={`h-4 w-4 ${iconClass} ${status.syncing ? 'animate-spin' : ''}`} />
        <span className="hidden xl:inline">{buttonLabel}</span>
        {status.pending > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[0.65rem] font-bold text-amber-300 xl:hidden">{status.pending}</span>}
      </button>

      <AnchoredPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} width={340} ariaLabel="Состояние облака" className="overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-xl p-3 ${state === 'offline' ? 'bg-amber-500/10' : 'lumi-accent-soft'}`}><Cloud className={`h-5 w-5 ${iconClass}`} /></div>
          <div className="min-w-0"><p className="lumi-text font-semibold">{label}</p><p className="lumi-muted mt-1 text-xs leading-5">{sessionProblem ? 'Копия на устройстве доступна, но чтение и сохранение сейчас не подтверждены.' : state === 'offline' ? 'Работайте дальше: изменения остаются на устройстве и отправятся после восстановления связи.' : status.pending > 0 ? 'Часть изменений сохранена на устройстве и ещё ожидает отправки.' : 'Изменения на этом устройстве синхронизированы.'}</p></div>
        </div>

        <div className="lumi-panel-muted mt-4 space-y-3 rounded-xl border p-3 text-xs">
          <div className="flex items-center justify-between gap-3"><span className="lumi-muted flex items-center gap-2"><Wifi className="h-4 w-4" />Интернет</span><span className="lumi-muted-strong font-medium">{navigator.onLine ? 'Есть соединение' : 'Нет соединения'}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="lumi-muted flex items-center gap-2"><HardDriveDownload className="h-4 w-4" />На устройстве</span><span className="lumi-muted-strong font-medium">{status.pending ? `Ждут отправки: ${status.pending}` : 'Очередь пуста'}</span></div>
          <div className="flex items-center justify-between gap-3"><span className="lumi-muted">Последняя синхронизация</span><span className="lumi-muted-strong text-right font-medium">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('ru-RU') : 'Ещё не было'}</span></div>
        </div>

        {status.error && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{status.error}</span></div>}
        {issues.length > 0 && <div className="mt-3 space-y-2"><p className="lumi-muted text-xs font-semibold uppercase tracking-wide">Не отправлено</p>{issues.slice(0, 3).map(issue => { const description = describeQueueIssue(issue); return <div key={issue.id} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs"><div className="flex items-center justify-between gap-3"><span className="lumi-text font-semibold">{description.entity}</span><span className="lumi-muted">Попыток: {issue.attempts}</span></div><p className="mt-1 text-amber-200">{description.reason}</p><p className="lumi-muted mt-1">Сохранено на устройстве {new Date(issue.createdAt).toLocaleString('ru-RU')}</p></div> })}</div>}
        <button type="button" disabled={status.syncing || !navigator.onLine} onClick={() => void synchronize(true)} className="lumi-gradient-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${status.syncing ? 'animate-spin' : ''}`} />{status.pending ? 'Повторить отправку' : 'Проверить синхронизацию'}</button>
        <p className="lumi-muted mt-3 text-[0.7rem] leading-5">KvartoCRM не должен требовать VPN. Если интернет есть, но синхронизация недоступна, приложение использует копию на устройстве и повторяет отправку автоматически.</p>
      </AnchoredPopover>
    </div>
  )
}

export default OfflineSyncStatus
