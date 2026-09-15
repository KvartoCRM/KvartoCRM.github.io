import { useMutation, useQuery } from '@tanstack/react-query'
import { propertyShowingFromInput, type PropertyShowing, type PropertyShowingInput } from '../lib/propertyShowingMapping'
import { fetchPropertyShowings, savePropertyShowing, trashPropertyShowing } from '../lib/propertyShowings'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type ShowingContext = { previous?: PropertyShowing[] }

export const usePropertyShowings = (userId?: string, propertyId?: string) => {
  const queryKey = crmQueryKeys.propertyShowings(userId || 'anonymous', propertyId || 'unknown')
  const query = useQuery({
    queryKey,
    queryFn: () => fetchPropertyShowings(userId!, propertyId!),
    enabled: Boolean(userId && propertyId),
    staleTime: 60_000,
  })

  const beginOptimisticUpdate = async (updater: (records: PropertyShowing[]) => PropertyShowing[]): Promise<ShowingContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<PropertyShowing[]>(queryKey)
    queryClient.setQueryData<PropertyShowing[]>(queryKey, current => updater(current || []))
    return { previous }
  }
  const restore = (context?: ShowingContext) => {
    if (!context) return
    if (context.previous) queryClient.setQueryData(queryKey, context.previous)
    else queryClient.removeQueries({ queryKey, exact: true })
  }
  const refreshRelated = async () => {
    if (!userId) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.planActuals(userId) }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: ({ input, id }: { input: PropertyShowingInput; id: string }) => savePropertyShowing(userId!, propertyId!, input, id),
    onMutate: ({ input, id }) => beginOptimisticUpdate(records => [propertyShowingFromInput(id, propertyId!, input), ...records]),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const trashMutation = useMutation({
    mutationFn: (showingId: string) => trashPropertyShowing(userId!, showingId),
    onMutate: showingId => beginOptimisticUpdate(records => records.filter(record => record.id !== showingId)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveShowing: (input: PropertyShowingInput) => saveMutation.mutateAsync({ input, id: crypto.randomUUID() }),
    removeShowing: trashMutation.mutateAsync,
    saving: saveMutation.isPending,
    mutationPending: saveMutation.isPending || trashMutation.isPending,
  }
}
