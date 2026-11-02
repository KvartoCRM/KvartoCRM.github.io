import type { Client, Property } from '../types'
import { createSignedFileUrls, type CrmFileRecord } from './files'
import { mapClientRow, mapPropertyRow } from './propertyMapping'
import {
  indexPropertyOwners,
  propertyOwnersWithLegacyFallback,
  type PropertyOwnerAssignment,
  type PropertyOwnerRow,
} from './propertyOwners'
import { supabase } from './supabase'
import { fetchAllRows } from './pagination'

export type PropertyCatalog = {
  properties: Property[]
  clients: Client[]
  propertyOwners: Record<string, PropertyOwnerAssignment[]>
}

export const fetchDealProperties = async (userId: string): Promise<Property[]> => {
  const { data, error } = await fetchAllRows(() => supabase
    .from('properties')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false }))
  if (error) throw error
  return (data || []).map(mapPropertyRow)
}

export const fetchPropertyCatalog = async (userId: string): Promise<PropertyCatalog> => {
  const [propertiesResult, clientsResult, ownersResult] = await Promise.all([
    fetchAllRows(() => supabase
      .from('properties')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })),
    fetchAllRows(() => supabase
      .from('clients')
      .select('*').is('merged_into', null)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })),
    fetchAllRows(() => supabase
      .from('property_owners')
      .select('id,property_id,client_id,ownership_share,is_primary')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })),
  ])
  if (propertiesResult.error) throw propertiesResult.error

  const propertyRows = propertiesResult.data || []
  const properties = propertyRows.map(mapPropertyRow)
  const clients = clientsResult.error ? [] : (clientsResult.data || []).map(mapClientRow)
  const indexedOwners = ownersResult.error ? new Map() : indexPropertyOwners((ownersResult.data || []) as PropertyOwnerRow[])
  const propertyOwners = Object.fromEntries(properties.map(property => [
    property.id,
    propertyOwnersWithLegacyFallback(property, indexedOwners.get(property.id) || []),
  ]))
  if (properties.length === 0) return { properties, clients, propertyOwners }

  try {
    const { data: mediaRows, error: mediaError } = await fetchAllRows(() => supabase
      .from('crm_files')
      .select('*')
      .eq('user_id', userId)
      .eq('bucket', 'crm-images')
      .not('property_id', 'is', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }))
    if (mediaError || !mediaRows?.length) return { properties, clients, propertyOwners }

    const covers = new Map<string, CrmFileRecord>()
    const activeIds = new Set(properties.map(property => property.id))
    for (const file of mediaRows as CrmFileRecord[]) {
      if (file.property_id && activeIds.has(file.property_id) && !covers.has(file.property_id)) covers.set(file.property_id, file)
    }
    const urls = await createSignedFileUrls(Array.from(covers.values()))
    return {
      clients,
      propertyOwners,
      properties: properties.map(property => {
        const cover = covers.get(property.id)
        return cover ? { ...property, coverUrl: urls.get(cover.storage_path) } : property
      }),
    }
  } catch {
    return { properties, clients, propertyOwners }
  }
}
