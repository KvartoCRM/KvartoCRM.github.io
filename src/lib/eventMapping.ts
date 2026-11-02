import type { Event } from '../types'

export type EventUpsertInput = {
  durationMinutes?: number
  timeZone?: string
  expectedUpdatedAt?: string
  type: Event['type']
  title: string
  eventDate: string
  eventTime?: string
  location?: string
  notes?: string
  relatedClientId?: string
  relatedClientType?: Event['relatedClientType']
  relatedPropertyId?: string
}

type CloudEventRow = Record<string, unknown>

export const mapEventRow = (row: CloudEventRow): Event => ({
  durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : undefined,
  timeZone: typeof row.time_zone === 'string' ? row.time_zone : undefined,
  startsAt: typeof row.starts_at === 'string' ? row.starts_at : undefined,
  updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  id: String(row.id),
  userId: typeof row.user_id === 'string' ? row.user_id : '',
  type: row.type === 'call' ? 'call' : 'meeting',
  title: typeof row.title === 'string' ? row.title : '',
  eventDate: typeof row.event_date === 'string' ? row.event_date : '',
  eventTime: typeof row.event_time === 'string' ? row.event_time : undefined,
  location: typeof row.location === 'string' ? row.location : undefined,
  notes: typeof row.notes === 'string' ? row.notes : undefined,
  relatedClientId: typeof row.related_client_id === 'string' ? row.related_client_id : undefined,
  relatedClientType: row.related_client_type === 'owner' || row.related_client_type === 'buyer' ? row.related_client_type : undefined,
  relatedPropertyId: typeof row.related_property_id === 'string' ? row.related_property_id : undefined,
  isFavorite: Boolean(row.is_favorite),
  createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  isCompleted: Boolean(row.is_completed),
})

export const eventFromInput = (userId: string, id: string, input: EventUpsertInput, previous?: Event): Event => ({
  ...previous,
  id,
  userId,
  type: input.type,
  durationMinutes: input.durationMinutes,
  timeZone: input.timeZone,
  title: input.title,
  eventDate: input.eventDate,
  eventTime: input.eventTime,
  location: input.type === 'meeting' ? input.location : undefined,
  notes: input.notes,
  relatedClientId: input.relatedClientId,
  relatedClientType: input.relatedClientType,
  relatedPropertyId: input.type === 'meeting' ? input.relatedPropertyId : undefined,
  isFavorite: previous?.isFavorite ?? false,
  createdAt: previous?.createdAt || new Date().toISOString(),
  isCompleted: previous?.isCompleted ?? false,
})
