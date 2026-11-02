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
    duration_minutes: input.durationMinutes || (input.type === 'call' ? 15 : 60),
    time_zone: input.timeZone || 'Europe/Moscow',
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
  let query = eventId
    ? supabase.from('events').update(payload).eq('id', eventId).eq('user_id', userId).is('deleted_at', null)
    : supabase.from('events').insert({ ...payload, id, user_id: userId })
  if (eventId && input.expectedUpdatedAt) query = query.eq('updated_at', input.expectedUpdatedAt)
  const result = await query.select('*').setHeader('x-lumicrm-network-only','true').maybeSingle()
  if (result.error) {
    if (result.error.code !== '23505' || eventId) throw result.error
    const saved = await supabase.from('events').select('*').eq('id',id).eq('user_id',userId).is('deleted_at',null).setHeader('x-lumicrm-network-only','true').maybeSingle()
    if (saved.error || !saved.data || !Object.entries(payload).every(([key,value]) => key === 'event_time' && value ? String(saved.data[key]).slice(0,5) === String(value).slice(0,5) : saved.data[key] === value)) throw new Error('Запись уже существует с другими данными. Обновите расписание.')
    return mapEventRow(saved.data)
  }
  if (!result.data) throw new Error('Запись изменена на другом устройстве или удалена. Обновите расписание перед сохранением.')
  return mapEventRow(result.data)
}

export const trashEvent = async (userId: string, eventId: string) => {
  await moveToTrash('events', eventId, userId)
  return eventId
}

export const makeSavedEvent = (userId: string, id: string, input: EventUpsertInput, previous?: Event) => eventFromInput(userId, id, input, previous)
