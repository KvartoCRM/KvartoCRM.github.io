import { useMutation, useQuery } from '@tanstack/react-query'
import type { Client } from '../types'
import {
  fetchClientRequirement,
  fetchContactRecords,
  saveBuyerApplication,
  saveOwnerRecord,
  setContactFavorite,
  trashContact,
  type BuyerRequirementInput,
  type ContactInput,
  type OwnerPropertyInput,
} from '../lib/contacts'
import { contactFromInput } from '../lib/contactRecordMapping'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type ClientContext = { previous?: Client[] }

export const useClientRequirement = (
  userId?: string,
  clientId?: string,
  purpose: 'sale' | 'rent' = 'sale',
) => useQuery({
  queryKey: crmQueryKeys.clientRequirement(userId || 'anonymous', clientId || 'new', purpose),
  queryFn: () => fetchClientRequirement(userId!, clientId!, purpose),
  enabled: Boolean(userId && clientId),
  staleTime: 2 * 60_000,
})

export const useClientRecords = (userId?: string) => {
  const queryKey = crmQueryKeys.clientRecords(userId || 'anonymous')
  const query = useQuery<Client[]>({
    queryKey,
    queryFn: () => fetchContactRecords(userId!),
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
  })

  const beginOptimisticUpdate = async (updater: (clients: Client[]) => Client[]): Promise<ClientContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<Client[]>(queryKey)
    queryClient.setQueryData<Client[]>(queryKey, current => updater(current || []))
    return { previous }
  }
  const restore = (context?: ClientContext) => {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
  }
  const refreshRelated = async () => {
    if (!userId) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.contacts(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.properties(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.favorites(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.trash(userId) }),
    ])
  }

  const buyerMutation = useMutation({
    mutationFn: ({ input, requirement, clientId, id, requirementId }: {
      input: ContactInput
      requirement: BuyerRequirementInput
      clientId?: string
      id: string
      requirementId?: string
    }) => saveBuyerApplication(userId!, input, requirement, clientId, id, requirementId),
    onMutate: ({ input, clientId, id }) => beginOptimisticUpdate(clients => {
      const previous = clients.find(client => client.id === clientId)
      const next = contactFromInput(userId!, id, input, previous)
      return previous ? clients.map(client => client.id === clientId ? next : client) : [next, ...clients]
    }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        refreshRelated(),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.clientRequirement(userId!, variables.clientId || variables.id, variables.requirement.purpose) }),
      ])
    },
  })

  const ownerMutation = useMutation({
    mutationFn: ({ input, property, clientId, id }: {
      input: ContactInput
      property: OwnerPropertyInput
      clientId?: string
      id: string
    }) => saveOwnerRecord(userId!, input, property, clientId, id),
    onMutate: ({ input, clientId, id }) => beginOptimisticUpdate(clients => {
      const previous = clients.find(client => client.id === clientId)
      const next = contactFromInput(userId!, id, input, previous)
      return previous ? clients.map(client => client.id === clientId ? next : client) : [next, ...clients]
    }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const favoriteMutation = useMutation({
    mutationFn: (client: Client) => setContactFavorite(userId!, client),
    onMutate: client => beginOptimisticUpdate(clients => clients.map(item => item.id === client.id ? { ...item, isFavorite: !item.isFavorite } : item)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const trashMutation = useMutation({
    mutationFn: (clientId: string) => trashContact(userId!, clientId),
    onMutate: clientId => beginOptimisticUpdate(clients => clients.filter(client => client.id !== clientId)),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveBuyer: (input: ContactInput, requirement: BuyerRequirementInput, clientId?: string, requirementId?: string) => buyerMutation.mutateAsync({
      input,
      requirement,
      clientId,
      id: clientId || crypto.randomUUID(),
      requirementId,
    }),
    saveOwner: (input: ContactInput, property: OwnerPropertyInput, clientId?: string) => ownerMutation.mutateAsync({
      input,
      property: { ...property, newPropertyId: property.newPropertyId || crypto.randomUUID() },
      clientId,
      id: clientId || crypto.randomUUID(),
    }),
    toggleFavorite: favoriteMutation.mutateAsync,
    removeClient: trashMutation.mutateAsync,
    mutationPending: buyerMutation.isPending || ownerMutation.isPending || favoriteMutation.isPending || trashMutation.isPending,
  }
}
