import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { type CrmOverview, getCrmOverview } from '../lib/crm'
import { crmQueryKeys } from '../lib/queryClient'
import { clearWorkspaceNetworkRefresh, requestWorkspaceNetworkRefresh } from '../lib/offlineTransport'

const initialValue: CrmOverview = {
  owners: 0,
  buyers: 0,
  properties: 0,
  activeDeals: 0,
  completedToday: 0,
  tasks: [],
  events: [],
  recentProperties: [],
  analytics: { months: [], periods: { days: [], weeks: [], months: [] }, propertyTypes: [], totalDealVolume: 0, totalAgencyIncome: 0, totalAgentIncome: 0, incompleteFinanceDeals: 0 },
}

export function useCrmOverview(enabled: boolean) {
  const { user } = useAuth()
  const {
    data,
    error: queryError,
    isPending,
    refetch,
  } = useQuery({
    queryKey: crmQueryKeys.overview(user?.id || 'anonymous'),
    queryFn: () => getCrmOverview(user!.id),
    enabled: enabled && Boolean(user),
  })

  const reload = useCallback(async () => {
    if (!enabled || !user) return
    requestWorkspaceNetworkRefresh()
    try {
      await refetch({ cancelRefetch: true, throwOnError: true })
    } finally {
      clearWorkspaceNetworkRefresh()
    }
  }, [enabled, refetch, user])

  return {
    data: data ?? initialValue,
    loading: isPending && enabled,
    error: queryError
      ? 'Сервис сейчас не ответил. Показана копия с устройства; нажмите «Обновить», когда связь восстановится.'
      : null,
    reload,
  }
}
