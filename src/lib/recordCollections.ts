import type { Client, Property } from '../types'
import { mapClientRow, mapPropertyRow } from './propertyMapping'
import { mapArchiveRecords, mapTrashItems, type ArchivedProperty, type ArchiveRecords, type TrashItem } from './recordCollectionMapping'
import { recordPropertyHistory } from './propertyHistory'
import { buildPropertyHistoryChange } from './propertyHistoryMapping'
import { supabase } from './supabase'
import { fetchAllRows } from './pagination'
import { deleteForever, emptyTrash, moveToTrash, restoreFromTrash, type TrashTable } from './trash'

export type FavoriteRecords = { properties: Property[]; clients: Client[] }
export type ArchiveRecordKind = 'property' | 'client'

export const fetchArchiveRecords = async (userId: string): Promise<ArchiveRecords> => {
  const [propertyResult, clientResult] = await Promise.all([
    fetchAllRows(() => supabase.from('properties').select('id,address,price,rooms,area,status').eq('user_id', userId).is('deleted_at', null).in('status', ['sold', 'archived']).order('updated_at', { ascending: false })),
    fetchAllRows(() => supabase.from('clients').select('id,first_name,last_name,middle_name,phone,type,status').is('merged_into', null).eq('user_id', userId).is('deleted_at', null).eq('status', 'archived').order('updated_at', { ascending: false })),
  ])
  const firstError = [propertyResult.error, clientResult.error].find(Boolean)
  if (firstError) throw firstError
  return mapArchiveRecords(propertyResult.data || [], clientResult.data || [])
}

export const restoreArchivedRecord = async (userId: string, kind: ArchiveRecordKind, id: string, previousProperty?: ArchivedProperty) => {
  const table = kind === 'property' ? 'properties' : 'clients'
  const status = kind === 'property' ? 'available' : 'active'
  const { error } = await supabase.from(table).update({ status, archived_at: null }).eq('id', id).eq('user_id', userId)
  if (error) throw error
  if (kind === 'property' && previousProperty) {
    try {
      await recordPropertyHistory(userId, id, buildPropertyHistoryChange(previousProperty, { price: previousProperty.price, status: 'available' }), 'restore')
    } catch (historyError) {
      console.warn('Property history update failed:', historyError)
    }
  }
  return { kind, id }
}

export const trashArchivedRecord = async (userId: string, kind: ArchiveRecordKind, id: string) => {
  await moveToTrash(kind === 'property' ? 'properties' : 'clients', id, userId)
  return { kind, id }
}

export const fetchFavoriteRecords = async (userId: string): Promise<FavoriteRecords> => {
  const [propertyResult, clientResult] = await Promise.all([
    fetchAllRows(() => supabase.from('properties').select('*').eq('user_id', userId).is('deleted_at', null).eq('is_favorite', true).order('updated_at', { ascending: false })),
    fetchAllRows(() => supabase.from('clients').select('*').is('merged_into', null).eq('user_id', userId).is('deleted_at', null).eq('is_favorite', true).order('updated_at', { ascending: false })),
  ])
  const firstError = [propertyResult.error, clientResult.error].find(Boolean)
  if (firstError) throw firstError
  return {
    properties: (propertyResult.data || []).map(mapPropertyRow),
    clients: (clientResult.data || []).map(mapClientRow),
  }
}

export const removeFavoriteRecord = async (userId: string, kind: ArchiveRecordKind, id: string) => {
  const table = kind === 'property' ? 'properties' : 'clients'
  const { error } = await supabase.from(table).update({ is_favorite: false }).eq('id', id).eq('user_id', userId)
  if (error) throw error
  return { kind, id }
}

export const fetchTrashItems = async (userId: string): Promise<TrashItem[]> => {
  if (navigator.onLine) {
    try { await supabase.rpc('purge_lumicrm_trash') } catch { /* The scheduled purge remains a fallback. */ }
  }
  const [properties, clients, tasks, events, deals, activities] = await Promise.all([
    fetchAllRows(() => supabase.from('properties').select('id,address,status,deleted_at').eq('user_id', userId).not('deleted_at', 'is', null)),
    fetchAllRows(() => supabase.from('clients').select('id,first_name,last_name,middle_name,phone,deleted_at').is('merged_into', null).eq('user_id', userId).not('deleted_at', 'is', null)),
    fetchAllRows(() => supabase.from('tasks').select('id,title,due_date,deleted_at').eq('user_id', userId).not('deleted_at', 'is', null)),
    fetchAllRows(() => supabase.from('events').select('id,title,type,event_date,deleted_at').eq('user_id', userId).not('deleted_at', 'is', null)),
    fetchAllRows(() => supabase.from('deals').select('id,price,status,deleted_at').eq('user_id', userId).not('deleted_at', 'is', null)),
    fetchAllRows(() => supabase.from('crm_activities').select('id,title,type,occurred_at,deleted_at').eq('user_id', userId).not('deleted_at', 'is', null)),
  ])
  const firstError = [properties.error, clients.error, tasks.error, events.error, deals.error, activities.error].find(Boolean)
  if (firstError) throw firstError
  return mapTrashItems({
    properties: properties.data || [],
    clients: clients.data || [],
    tasks: tasks.data || [],
    events: events.data || [],
    deals: deals.data || [],
    activities: activities.data || [],
  })
}

export const restoreTrashItem = async (userId: string, table: TrashTable, id: string) => {
  await restoreFromTrash(table, id, userId)
  return { table, id }
}

export const removeTrashItem = async (userId: string, table: TrashTable, id: string) => {
  await deleteForever(table, id, userId)
  return { table, id }
}

export const clearTrashItems = async (userId: string) => emptyTrash(userId)
