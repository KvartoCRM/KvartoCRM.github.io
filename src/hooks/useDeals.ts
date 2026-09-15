import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchDeals, makeSavedDeal, saveDeal, trashDeal } from '../lib/deals'
import type { DealRecord, DealUpsertInput } from '../lib/dealMapping'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type DealContext = { previous?: DealRecord[] }

export const useDeals = (userId?: string) => {
  const queryKey = crmQueryKeys.deals(userId || 'anonymous')
  const query = useQuery<DealRecord[]>({
    queryKey,
    queryFn: () => fetchDeals(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const beginOptimisticUpdate = async (updater: (deals: DealRecord[]) => DealRecord[]): Promise<DealContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<DealRecord[]>(queryKey)
    queryClient.setQueryData<DealRecord[]>(queryKey, current => updater(current || []))
    return { previous }
  }
  const restore = (context?: DealContext) => {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
  }
  const refreshRelated = async () => {
    if (!userId) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.properties(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.dealProperties(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.planActuals(userId) }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: ({ input, dealId, id, existingFinanceActivityId, financeActivityId }: { input: DealUpsertInput; dealId?: string; id: string; existingFinanceActivityId?: string; financeActivityId: string }) => (
      saveDeal(userId!, input, dealId, id, existingFinanceActivityId, financeActivityId)
    ),
    onMutate: ({ input, dealId, id, financeActivityId }) => beginOptimisticUpdate(deals => {
      const previous = deals.find(deal => deal.id === dealId)
      const next = makeSavedDeal(userId!, id, financeActivityId, input, previous)
      return previous ? deals.map(deal => deal.id === dealId ? next : deal) : [next, ...deals]
    }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const trashMutation = useMutation({
    mutationFn: (dealId: string) => trashDeal(userId!, dealId),
    onMutate: dealId => beginOptimisticUpdate(deals => deals.filter(deal => deal.id !== dealId)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveDeal: (input: DealUpsertInput, dealId?: string) => {
      const previous = queryClient.getQueryData<DealRecord[]>(queryKey)?.find(deal => deal.id === dealId)
      return saveMutation.mutateAsync({
        input,
        dealId,
        id: dealId || crypto.randomUUID(),
        existingFinanceActivityId: previous?.financeActivityId,
        financeActivityId: previous?.financeActivityId || crypto.randomUUID(),
      })
    },
    removeDeal: trashMutation.mutateAsync,
    mutationPending: saveMutation.isPending || trashMutation.isPending,
  }
}
