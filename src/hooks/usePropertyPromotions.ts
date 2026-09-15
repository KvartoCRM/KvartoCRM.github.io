import { useMutation, useQuery } from '@tanstack/react-query'
import { propertyPromotionFromInput, type PropertyPromotion, type PropertyPromotionInput } from '../lib/propertyPromotionMapping'
import { fetchPropertyPromotions, savePropertyPromotion, trashPropertyPromotion } from '../lib/propertyPromotions'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type Context = { previous?: PropertyPromotion[] }

export const usePropertyPromotions = (userId?: string, propertyId?: string) => {
  const queryKey = crmQueryKeys.propertyPromotions(userId || 'anonymous', propertyId || 'unknown')
  const query = useQuery({ queryKey, queryFn: () => fetchPropertyPromotions(userId!, propertyId!), enabled: Boolean(userId && propertyId), staleTime: 60_000 })
  const begin = async (update: (items: PropertyPromotion[]) => PropertyPromotion[]): Promise<Context> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<PropertyPromotion[]>(queryKey)
    queryClient.setQueryData<PropertyPromotion[]>(queryKey, current => update(current || []))
    return { previous }
  }
  const restore = (context?: Context) => context?.previous && queryClient.setQueryData(queryKey, context.previous)
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
    userId ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }) : Promise.resolve(),
  ])
  const saveMutation = useMutation({
    mutationFn: ({ input, id }: { input: PropertyPromotionInput; id: string }) => savePropertyPromotion(userId!, propertyId!, input, id),
    onMutate: ({ input, id }) => begin(items => [propertyPromotionFromInput(id, propertyId!, input), ...items]),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refresh,
  })
  const removeMutation = useMutation({
    mutationFn: (id: string) => trashPropertyPromotion(userId!, id),
    onMutate: id => begin(items => items.filter(item => item.id !== id)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refresh,
  })
  return {
    ...query,
    savePromotion: (input: PropertyPromotionInput) => saveMutation.mutateAsync({ input, id: crypto.randomUUID() }),
    removePromotion: removeMutation.mutateAsync,
    saving: saveMutation.isPending,
  }
}
