import type { Event } from '../types/index.ts'
import { localDate } from './contactPresentation.ts'
import type { WorkCall } from './callActivityMapping.ts'

export const matchesText = (query: string, values: unknown[]) => {
  const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е')
  const text = normalize(values.filter(value => value != null).join(' '))
  const words = normalize(query).trim().split(/\s+/).filter(Boolean)
  if (words.every(word => text.includes(word))) return true
  const digits = query.replace(/\D/g, '')
  return /^[+\d\s()-]+$/.test(query) && digits.length > 0 && values.some(value => String(value || '').replace(/\D/g, '').includes(digits))
}

export const inDateRange = (value: string | null | undefined, from = '', to = '') => {
  if (!from && !to) return true
  if (!value) return false
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDate(new Date(value))
  return !date.includes('NaN') && (!from || date >= from) && (!to || date <= to)
}
export const inNumberRange = (value: number | null | undefined, min = '', max = '') => {
  if (!min && !max) return true
  return value != null && Number.isFinite(value) && (!min || value >= Number(min)) && (!max || value <= Number(max))
}

export const sortRecords = <T,>(rows: T[], getValue: (row: T) => string | number | null | undefined, direction = 'desc') => [...rows].sort((a, b) => {
  const left = getValue(a), right = getValue(b)
  const missing = (value: unknown) => value == null || value === '' || typeof value === 'number' && !Number.isFinite(value)
  if (missing(left)) return missing(right) ? 0 : 1
  if (missing(right)) return -1
  const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'ru', { numeric: true, sensitivity: 'base' })
  return compared * (direction === 'asc' ? 1 : -1)
})

export const filterCalls = (calls: WorkCall[], filters: Record<string, string>, query = '', type = 'all') => sortRecords(calls.filter(call => {
  const meta = call.metadata || {}
  if (type !== 'all' && meta.call_type !== type) return false
  if (filters.result && (meta.status || call.outcome) !== filters.result) return false
  if (filters.source && call.source !== filters.source) return false
  if (!matchesText(query, [call.title, meta.contact_name, meta.phone, meta.address, call.notes])) return false
  if (!inDateRange(call.occurred_at, filters.from, filters.to)) return false
  if (filters.timeFrom || filters.timeTo) {
    const date = new Date(call.occurred_at || '')
    if (Number.isNaN(date.getTime())) return false
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    if (filters.timeFrom && time < filters.timeFrom || filters.timeTo && time > filters.timeTo) return false
  }
  return true
}), call => filters.sort === 'name' ? call.metadata?.contact_name || call.title : filters.sort === 'result' ? call.metadata?.status || call.outcome : filters.sort === 'source' ? call.source : Date.parse(call.occurred_at || ''), filters.direction)

export const filterMeetings = (meetings: Event[], filters: Record<string, string>) => sortRecords(meetings.filter(meeting => {
  if (!matchesText(filters.query || '', [meeting.title, meeting.location, meeting.notes])) return false
  if (!inDateRange(meeting.eventDate, filters.from, filters.to)) return false
  if (filters.status && (meeting.isCompleted ? 'completed' : 'planned') !== filters.status) return false
  if (filters.timeFrom || filters.timeTo) {
    const time = meeting.eventTime?.slice(0, 5)
    if (!time || filters.timeFrom && time < filters.timeFrom || filters.timeTo && time > filters.timeTo) return false
  }
  return true
}), meeting => filters.sort === 'name' ? meeting.title : filters.sort === 'location' ? meeting.location : filters.sort === 'created' ? Date.parse(meeting.createdAt) : meeting.eventDate ? meeting.eventDate + 'T' + (meeting.eventTime || '00:00') : undefined, filters.direction || 'asc')
