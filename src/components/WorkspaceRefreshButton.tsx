import { useEffect, useState } from 'react'
import { Check, RefreshCw, TriangleAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { flushOfflineFiles } from '../lib/offlineFiles'
import { clearWorkspaceNetworkRefresh, flushOfflineQueue, getOfflineQueueCount, requestWorkspaceNetworkRefresh } from '../lib/offlineTransport'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type RefreshState = 'idle' | 'refreshing' | 'success' | 'error'

const WorkspaceRefreshButton = () => {
  const { user } = useAuth()
  const [state, setState] = useState<RefreshState>('idle')
  const refreshing = state === 'refreshing'

  useEffect(() => {
    if (state === 'idle' || state === 'refreshing') return
    const timer = window.setTimeout(() => setState('idle'), 2400)
    return () => window.clearTimeout(timer)
  }, [state])

  const refresh = async () => {
    if (!user || refreshing) return
    setState('refreshing')
    try {
      if (!navigator.onLine) throw new TypeError('Нет подключения к интернету')
      await flushOfflineFiles(user.id)
      for (let batch = 0; batch < 4; batch += 1) {
        const synced = await flushOfflineQueue()
        const pending = await getOfflineQueueCount(user.id)
        if (pending === 0 || synced === 0) break
      }
      requestWorkspaceNetworkRefresh()
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.root, refetchType: 'none' })
      await queryClient.refetchQueries(
        { queryKey: crmQueryKeys.root, type: 'active' },
        { cancelRefetch: true, throwOnError: true },
      )
      window.dispatchEvent(new CustomEvent('lumicrm:workspace-refreshed'))
      setState('success')
    } catch {
      setState('error')
    } finally {
      clearWorkspaceNetworkRefresh()
    }
  }

  const Icon = state === 'success' ? Check : state === 'error' ? TriangleAlert : RefreshCw
  const label = state === 'refreshing' ? 'Обновляем…' : state === 'success' ? 'Обновлено' : state === 'error' ? 'Не удалось' : 'Обновить'

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={!user || refreshing}
      className="lumi-control inline-flex items-center gap-2 rounded-xl p-2.5 text-xs disabled:opacity-50 xl:px-3"
      title={state === 'error' ? 'Свежие данные не получены. Нажмите, чтобы повторить.' : 'Загрузить свежие данные текущего раздела'}
      aria-label={label}
    >
      <Icon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''} ${state === 'success' ? 'text-emerald-400' : state === 'error' ? 'text-amber-400' : ''}`} />
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}

export default WorkspaceRefreshButton
