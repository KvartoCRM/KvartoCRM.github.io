import { zonedInstant } from './scheduling.ts'
import { mapCallActivityRow, mapCallEventRow, type WorkCall } from './callActivityMapping.ts'

type Row = Record<string, unknown>
export type HistoryEntry = {
  id: string; kind: 'call' | 'meeting' | 'task'; title: string; date: string; time: string
  dateNote?: string; notes: string; outcome: string; reaction?: string; next?: string
  clientId?: string; contact?: string; phone?: string; propertyId?: string; location?: string
}
const str = (value: unknown) => typeof value === 'string' ? value : ''
const meta = (row: Row): Row => row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {}
export function historyDate(value: unknown) {
  const text = str(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: text, time: '' }
  const date = new Date(text)
  if (!text || !Number.isFinite(date.getTime())) return { date: '', time: '' }
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}
const meetingDate = (row: Row) => {
  if (row.starts_at) return historyDate(row.starts_at)
  if (row.event_date && row.event_time) {
    try { return historyDate(zonedInstant(str(row.event_date), str(row.event_time), str(row.time_zone) || 'Europe/Moscow').toISOString()) } catch { /* Preserve legacy calendar date if its time is invalid. */ }
  }
  return {date:str(row.event_date),time:''}
}
const callEntry = (call: WorkCall): HistoryEntry => ({
  id: `call:${call.id}`, kind: 'call', title: call.title || 'Звонок', ...historyDate(call.occurred_at),
  notes: [call.notes, call.metadata?.second_comment].filter(Boolean).join('\n\n'), outcome: call.outcome || call.metadata?.status || '',
  clientId: call.metadata?.client_id, contact: call.metadata?.contact_name, phone: call.metadata?.phone,
  location: call.metadata?.address, next: call.metadata?.next_contact_at,
})
export function buildWorkHistory(events: Row[], activities: Row[], tasks: Row[]): HistoryEntry[] {
  const liveEvents = events.filter(r => !r.deleted_at), liveActivities = activities.filter(r => !r.deleted_at)
  const entries: HistoryEntry[] = [], calls = new Map<string, HistoryEntry>()
  for (const row of liveActivities) if (row.type === 'call' && row.status === 'completed') {
    const entry = callEntry(mapCallActivityRow(row)); entry.clientId ||= str(row.client_id); calls.set(String(row.id), entry)
  }
  for (const row of liveEvents) { const call = mapCallEventRow(row); if (call) calls.set(call.id, callEntry(call)) }
  entries.push(...calls.values())
  const represented = new Set<string>()
  for (const row of liveActivities) {
    if (row.type !== 'meeting' || row.status !== 'completed') continue
    const m = meta(row), eventId = str(m.event_id) || str(row.external_key).replace(/^meeting-result:/, '')
    const event = liveEvents.find(e => e.id === eventId)
    if (event) represented.add(eventId)
    entries.push({ id: `meeting-result:${row.id}`, kind: 'meeting', title: str(event?.title) || str(row.title) || 'Встреча',
      ...(event?.event_date ? meetingDate(event) : historyDate(row.occurred_at)), dateNote: event?.event_date ? 'Дата встречи в календаре' : 'Дата записи итога', notes: [str(row.notes), event?.notes ? `Заметки встречи: ${str(event.notes)}` : ''].filter(Boolean).join('\n\n'),
      outcome: str(row.outcome), reaction: str(m.reaction), next: str(m.next_contact_at) || str(row.due_at),
      clientId: str(row.client_id) || str(event?.related_client_id), propertyId: str(row.property_id) || str(event?.related_property_id), location: str(event?.location),
    })
  }
  for (const row of liveEvents) {
    if (!row.is_completed || row.type !== 'meeting' || str(row.external_key).startsWith('call-log:') || represented.has(str(row.id))) continue
    entries.push({id:`meeting:${row.id}`,kind:'meeting',title:str(row.title)||'Встреча',...meetingDate(row),dateNote:'Дата в календаре; отдельный итог не записан',notes:str(row.notes),outcome:'Завершена',clientId:str(row.related_client_id),propertyId:str(row.related_property_id),location:str(row.location)})
  }
  for (const row of tasks) {
    if (row.deleted_at || !(row.is_completed || row.status === 'done')) continue
    const completed = historyDate(row.completed_at)
    entries.push({id:`task:${row.id}`,kind:'task',title:str(row.title)||'Задача',...(completed.date ? completed : {date:str(row.due_date),time:str(row.due_time).slice(0,5)}),dateNote:completed.date?'Дата выполнения':'Дата выполнения не сохранена; показан плановый срок',notes:str(row.description),outcome:'Выполнена'})
  }
  return entries.sort((a,b)=>`${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`)||a.id.localeCompare(b.id))
}
export function filterWorkHistory(entries: HistoryEntry[], kind: string, date: string, query: string) {
  const text = query.trim().toLocaleLowerCase('ru')
  return entries.filter(r=>(!kind||r.kind===kind)&&(!date||r.date===date)&&(!text||[r.title,r.notes,r.contact,r.phone,r.outcome,r.reaction,r.location].join(' ').toLocaleLowerCase('ru').includes(text)))
}
