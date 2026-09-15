import { useMutation, useQuery } from '@tanstack/react-query'
import type { Event } from '../types'
import { crmQueryKeys, queryClient } from '../lib/queryClient'
import { fetchEvents, makeSavedEvent, saveEvent, trashEvent } from '../lib/events'
import type { EventUpsertInput } from '../lib/eventMapping'

type EventContext = { previous?: Event[] }

export const useEvents = (userId?: string) => {
  const queryKey = crmQueryKeys.events(userId || 'anonymous')
  const query = useQuery<Event[]>({
    queryKey,
    queryFn: () => fetchEvents(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const beginOptimisticUpdate = async (updater: (events: Event[]) => Event[]): Promise<EventContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<Event[]>(queryKey)
    queryClient.setQueryData<Event[]>(queryKey, current => updater(current || []))
    return { previous }
  }
  const restore = (context?: EventContext) => {
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
    mutationFn: ({ input, eventId, id }: { input: EventUpsertInput; eventId?: string; id: string }) => saveEvent(userId!, input, eventId, id),
    onMutate: ({ input, eventId, id }) => beginOptimisticUpdate(events => {
      const previous = events.find(event => event.id === eventId)
      const next = makeSavedEvent(userId!, id, input, previous)
      return previous ? events.map(event => event.id === eventId ? next : event) : [...events, next]
    }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const trashMutation = useMutation({
    mutationFn: (eventId: string) => trashEvent(userId!, eventId),
    onMutate: eventId => beginOptimisticUpdate(events => events.filter(event => event.id !== eventId)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveEvent: (input: EventUpsertInput, eventId?: string) => saveMutation.mutateAsync({ input, eventId, id: eventId || crypto.randomUUID() }),
    removeEvent: trashMutation.mutateAsync,
    mutationPending: saveMutation.isPending || trashMutation.isPending,
  }
}
