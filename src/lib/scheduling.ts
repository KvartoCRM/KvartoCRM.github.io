import type { Event } from '../types'

export const DEFAULT_ZONE = 'Europe/Moscow'
export const calendarParts = (value: Date, zone = DEFAULT_ZONE) => {
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(value)
  const get = (key: string) => parts.find(part => part.type === key)?.value || ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}
export function zonedInstant(date: string, time: string, zone = DEFAULT_ZONE): Date {
  const target = Date.parse(`${date}T${time.slice(0,5)}:00Z`)
  if (!Number.isFinite(target)) throw new Error('Укажите корректные дату и время.')
  let instant = target
  for (let attempt = 0; attempt < 4; attempt++) {
    const shown = calendarParts(new Date(instant), zone)
    const delta = target - Date.parse(`${shown.date}T${shown.time}:00Z`)
    if (!delta) return new Date(instant)
    instant += delta
  }
  throw new Error('Такого времени нет в выбранном часовом поясе. Выберите другое время.')
}
export const eventStart = (event: Event) => event.eventTime ? (event.startsAt ? new Date(event.startsAt) : zonedInstant(event.eventDate,event.eventTime,event.timeZone || DEFAULT_ZONE)) : null
export const eventDuration = (event: Event) => event.durationMinutes || (event.type === 'call' ? 15 : 60)
export const conflictsFor = (events: Event[], start: Date, duration: number, exceptId?: string) => events.filter(event => {
  if (event.id === exceptId || event.isCompleted) return false
  const other = eventStart(event)?.getTime()
  return other !== undefined && other !== null && other < start.getTime() + duration * 60000 && other + eventDuration(event) * 60000 > start.getTime()
})
export function nextFreeTime(events: Event[], start: Date, duration: number, exceptId?: string) {
  let candidate = new Date(start)
  for (let attempt = 0; attempt <= events.length; attempt++) {
    const conflicts = conflictsFor(events,candidate,duration,exceptId)
    if (!conflicts.length) return candidate
    candidate = new Date(Math.max(...conflicts.map(event => eventStart(event)!.getTime() + eventDuration(event) * 60000)))
  }
  return candidate
}
export const shiftDate = (date: string, amount: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate()+amount); return value.toISOString().slice(0,10) }
export const weekDates = (date: string) => { const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); const monday = shiftDate(date,-((weekday+6)%7)); return Array.from({length:7},(_,index)=>shiftDate(monday,index)) }
