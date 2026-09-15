import { useMutation, useQuery } from '@tanstack/react-query'
import { makeSavedMonthlyPlan, fetchLatestMonthlyPlan, fetchPlanActualSources, saveMonthlyPlan } from '../lib/monthlyPlans'
import type { MonthlyPlan, MonthlyPlanUpsertInput } from '../lib/monthlyPlanMapping'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type PlanContext = { previous?: MonthlyPlan | null }

export const useMonthlyPlan = (userId?: string) => {
  const queryKey = crmQueryKeys.monthlyPlan(userId || 'anonymous')
  const planQuery = useQuery<MonthlyPlan | null>({
    queryKey,
    queryFn: () => fetchLatestMonthlyPlan(userId!),
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
  })
  const actualsQuery = useQuery({
    queryKey: crmQueryKeys.planActuals(userId || 'anonymous'),
    queryFn: () => fetchPlanActualSources(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: ({ input, planId, id }: { input: MonthlyPlanUpsertInput; planId?: string; id: string }) => (
      saveMonthlyPlan(userId!, input, planId, id)
    ),
    onMutate: async ({ input, planId, id }): Promise<PlanContext> => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<MonthlyPlan | null>(queryKey)
      queryClient.setQueryData<MonthlyPlan>(queryKey, makeSavedMonthlyPlan(userId!, id, input, previous || undefined))
      return { previous }
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
  })

  return {
    plan: planQuery.data,
    actuals: actualsQuery.data,
    isLoading: planQuery.isLoading || actualsQuery.isLoading,
    error: planQuery.error || actualsQuery.error,
    refetch: async () => Promise.all([planQuery.refetch(), actualsQuery.refetch()]),
    savePlan: (input: MonthlyPlanUpsertInput, planId?: string) => saveMutation.mutateAsync({ input, planId, id: planId || crypto.randomUUID() }),
    mutationPending: saveMutation.isPending,
  }
}
