import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { flushOfflineFiles } from '../lib/offlineFiles'
import { flushOfflineQueue } from '../lib/offlineTransport'
import { crmQueryKeys, queryClient } from '../lib/queryClient'
import { warmOfflineWorkspace } from '../lib/supabase'

const WorkspaceRefreshButton = () => {
  const { user } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    if (!user || refreshing) return
    setRefreshing(true)
    try {
      await flushOfflineQueue()
      await flushOfflineFiles(user.id)
      await warmOfflineWorkspace(user.id, true)
      await queryClient.invalidateQueries({ queryKey: crmQueryKeys.root, refetchType: 'active' })
      window.dispatchEvent(new CustomEvent('lumicrm:workspace-refreshed'))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={!user || refreshing}
      className="lumi-control inline-flex items-center gap-2 rounded-xl p-2.5 text-xs disabled:opacity-50 xl:px-3"
      title="Обновить данные текущего раздела"
      aria-label="Обновить данные"
    >
      <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
      <span className="hidden xl:inline">Обновить</span>
    </button>
  )
}

export default WorkspaceRefreshButton
