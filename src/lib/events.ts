import type { Event } from '../types'
import { eventFromInput, mapEventRow, type EventUpsertInput } from './eventMapping'
import { supabase } from './supabase'
import { fetchAllRows } from './pagination'
import { moveToTrash } from './trash'

export const fetchEvents = async (userId: string): Promise<Event[]> => {
  const { data, error } = await fetchAllRows(() => supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: false }))
  if (error) throw error
  return (data || [])
    .filter(row => typeof row.external_key !== 'string' || !row.external_key.startsWith('call-log:'))
    .map(mapEventRow)
}

export const saveEvent = async (userId: string, input: EventUpsertInput, eventId?: string, newEventId?: string) => {
  const id = eventId || newEventId || crypto.randomUUID()
  const payload = {
    type: input.type,
    title: input.title,
    event_date: input.eventDate,
    event_time: input.eventTime || null,
    location: input.type === 'meeting' ? input.location || null : null,
    notes: input.notes || null,
    related_client_id: input.relatedClientId || null,
    related_client_type: input.relatedClientType || null,
    related_property_id: input.type === 'meeting' ? input.relatedPropertyId || null : null,
  }
  const result = eventId
    ? await supabase.from('events').update(payload).eq('id', eventId).eq('user_id', userId)
    : await supabase.from('events').insert({ ...payload, id, user_id: userId })
  if (result.error) throw result.error
  return { id, input }
}

export const trashEvent = async (userId: string, eventId: string) => {
  await moveToTrash('events', eventId, userId)
  return eventId
}

export const makeSavedEvent = (userId: string, id: string, input: EventUpsertInput, previous?: Event) => eventFromInput(userId, id, input, previous)
