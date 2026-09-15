import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchCallActivities, makeSavedCall, saveCallActivity, trashCallActivity } from '../lib/callActivities'
import type { CallActivityInput, WorkCall } from '../lib/callActivityMapping'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type CallContext = { previous?: WorkCall[] }

export const useCallActivities = (userId?: string) => {
  const queryKey = crmQueryKeys.calls(userId || 'anonymous')
  const query = useQuery<WorkCall[]>({
    queryKey,
    queryFn: () => fetchCallActivities(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const beginOptimisticUpdate = async (updater: (calls: WorkCall[]) => WorkCall[]): Promise<CallContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<WorkCall[]>(queryKey)
    queryClient.setQueryData<WorkCall[]>(queryKey, current => updater(current || []))
    return { previous }
  }
  const restore = (context?: CallContext) => {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
  }
  const refreshRelated = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
      userId ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }) : Promise.resolve(),
      userId ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.planActuals(userId) }) : Promise.resolve(),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: ({ input, callId, id }: { input: CallActivityInput; callId?: string; id: string }) => saveCallActivity(userId!, input, callId, id),
    onMutate: ({ input, callId, id }) => beginOptimisticUpdate(calls => {
      const next = makeSavedCall(id, input)
      return callId ? calls.map(call => call.id === callId ? next : call) : [next, ...calls]
    }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const trashMutation = useMutation({
    mutationFn: (callId: string) => trashCallActivity(userId!, callId),
    onMutate: callId => beginOptimisticUpdate(calls => calls.filter(call => call.id !== callId)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveCall: (input: CallActivityInput, callId?: string) => saveMutation.mutateAsync({ input, callId, id: callId || crypto.randomUUID() }),
    removeCall: trashMutation.mutateAsync,
    mutationPending: saveMutation.isPending || trashMutation.isPending,
  }
}
