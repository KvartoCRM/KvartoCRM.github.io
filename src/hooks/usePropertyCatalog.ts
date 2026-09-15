import { useMutation, useQuery } from '@tanstack/react-query'
import type { Property } from '../types'
import { fetchDealProperties, fetchPropertyCatalog, type PropertyCatalog } from '../lib/propertyCatalog'
import { propertyFromInput, type PropertyUpsertInput } from '../lib/propertyRecordMapping'
import { normalizePropertyOwners, type PropertyOwnerAssignment } from '../lib/propertyOwners'
import {
  archiveProperty,
  fetchPropertyDetails,
  saveProperty,
  setPropertyFavorite,
  trashProperty,
  type PropertyDetailsRecord,
} from '../lib/properties'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

type PropertyContext = { previous?: PropertyCatalog }

export const usePropertyDetails = (userId?: string, propertyId?: string, enabled = true) => useQuery({
  queryKey: crmQueryKeys.propertyDetails(userId || 'anonymous', propertyId || 'new'),
  queryFn: () => fetchPropertyDetails(userId!, propertyId!),
  enabled: Boolean(userId && propertyId && enabled),
  staleTime: 2 * 60_000,
})

export const useDealProperties = (userId?: string) => useQuery({
  queryKey: crmQueryKeys.dealProperties(userId || 'anonymous'),
  queryFn: () => fetchDealProperties(userId!),
  enabled: Boolean(userId),
  staleTime: 2 * 60_000,
})

export const usePropertyCatalog = (userId?: string) => {
  const queryKey = crmQueryKeys.properties(userId || 'anonymous')
  const query = useQuery<PropertyCatalog>({
    queryKey,
    queryFn: () => fetchPropertyCatalog(userId!),
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
  })

  const beginOptimisticUpdate = async (updater: (catalog: PropertyCatalog) => PropertyCatalog): Promise<PropertyContext> => {
    await queryClient.cancelQueries({ queryKey })
    const previous = queryClient.getQueryData<PropertyCatalog>(queryKey)
    queryClient.setQueryData<PropertyCatalog>(queryKey, current => updater(current || { properties: [], clients: [], propertyOwners: {} }))
    return { previous }
  }
  const restore = (context?: PropertyContext) => {
    if (!context) return
    if (context.previous) queryClient.setQueryData(queryKey, context.previous)
    else queryClient.removeQueries({ queryKey, exact: true })
  }
  const refreshRelated = async () => {
    if (!userId) return
    await Promise.all([
      queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.dealProperties(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.overview(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.archive(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.favorites(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.trash(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.clientRecords(userId) }),
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.contacts(userId) }),
      queryClient.invalidateQueries({ queryKey: ['crm', userId, 'search'] }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: ({ input, details, propertyId, id, owners, previous }: {
      input: PropertyUpsertInput
      details: PropertyDetailsRecord
      propertyId?: string
      id: string
      owners: PropertyOwnerAssignment[]
      previous?: Property
    }) => saveProperty(userId!, input, details, propertyId, id, owners, previous),
    onMutate: ({ input, propertyId, id, owners }) => beginOptimisticUpdate(catalog => {
      const previous = catalog.properties.find(property => property.id === propertyId)
      const next = propertyFromInput(userId!, id, input, previous)
      const properties = previous
        ? catalog.properties.map(property => property.id === propertyId ? next : property)
        : [next, ...catalog.properties]
      return { ...catalog, properties, propertyOwners: { ...catalog.propertyOwners, [id]: normalizePropertyOwners(owners) } }
    }),
    onError: (_error, _variables, context) => restore(context),
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        refreshRelated(),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.propertyDetails(userId!, variables.propertyId || variables.id) }),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.propertyHistory(userId!, variables.propertyId || variables.id) }),
      ])
    },
  })

  const favoriteMutation = useMutation({
    mutationFn: (property: Property) => setPropertyFavorite(userId!, property),
    onMutate: property => beginOptimisticUpdate(catalog => ({
      ...catalog,
      properties: catalog.properties.map(item => item.id === property.id ? { ...item, isFavorite: !item.isFavorite } : item),
    })),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  const archiveMutation = useMutation({
    mutationFn: (property: Property) => archiveProperty(userId!, property),
    onMutate: property => beginOptimisticUpdate(catalog => ({
      ...catalog,
      properties: catalog.properties.filter(item => item.id !== property.id),
    })),
    onError: (_error, _variables, context) => restore(context),
    onSettled: async (_data, _error, property) => {
      await Promise.all([
        refreshRelated(),
        queryClient.invalidateQueries({ queryKey: crmQueryKeys.propertyHistory(userId!, property.id) }),
      ])
    },
  })

  const trashMutation = useMutation({
    mutationFn: (propertyId: string) => trashProperty(userId!, propertyId),
    onMutate: propertyId => beginOptimisticUpdate(catalog => ({
      ...catalog,
      properties: catalog.properties.filter(property => property.id !== propertyId),
    })),
    onError: (_error, _variables, context) => restore(context),
    onSettled: refreshRelated,
  })

  return {
    ...query,
    saveProperty: (input: PropertyUpsertInput, details: PropertyDetailsRecord, propertyId?: string, owners: PropertyOwnerAssignment[] = []) => {
      const preparedOwners = owners.map(owner => ({ ...owner, id: owner.id || crypto.randomUUID() }))
      const previous = queryClient.getQueryData<PropertyCatalog>(queryKey)?.properties.find(property => property.id === propertyId)
      return saveMutation.mutateAsync({ input, details, propertyId, id: propertyId || crypto.randomUUID(), owners: preparedOwners, previous })
    },
    toggleFavorite: favoriteMutation.mutateAsync,
    archiveProperty: (propertyId: string) => {
      const property = queryClient.getQueryData<PropertyCatalog>(queryKey)?.properties.find(item => item.id === propertyId)
      if (!property) return Promise.reject(new Error('Объект не найден в локальном кэше.'))
      return archiveMutation.mutateAsync(property)
    },
    removeProperty: trashMutation.mutateAsync,
    mutationPending: saveMutation.isPending || favoriteMutation.isPending || archiveMutation.isPending || trashMutation.isPending,
  }
}
