export type QuickCallDraft = {
  id: string; nextId: string; updatedAt: number; clientId: string; name: string; phone: string;
  status: string; notes: string; date: string; time: string; type: 'cold' | 'warm' | 'inbound' | 'selection';
  nextDate: string; nextTime: string; schedule: boolean;
}
export const validQuickDraft = (value: unknown, now = Date.now()): value is QuickCallDraft => {
  if (!value || typeof value !== 'object') return false
  const d = value as QuickCallDraft
  return /^[\da-f-]{36}$/i.test(d.id) && /^[\da-f-]{36}$/i.test(d.nextId) && typeof d.updatedAt === 'number' && now - d.updatedAt < 7 * 86400000
    && ['clientId','name','phone','status','notes','date','time','nextDate','nextTime'].every(k => typeof (d as unknown as Record<string, unknown>)[k] === 'string')
    && ['cold','warm','inbound','selection'].includes(d.type) && typeof d.schedule === 'boolean'
}
export function quickCallError(d: QuickCallDraft, now = new Date()) {
  if (!d.name.trim() && !d.phone.trim()) return 'Укажите имя или телефон собеседника.'
  const occurred = new Date(`${d.date}T${d.time}`)
  if (!d.date || !d.time || Number.isNaN(occurred.getTime())) return 'Укажите дату и время звонка.'
  const validDate = (value: Date, date: string, time: string) => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}` === date && value.toTimeString().slice(0,5) === time
  if (!validDate(occurred,d.date,d.time)) return 'Укажите существующую дату и время звонка.'
  if (d.status === 'Перезвонить' && !d.schedule) return 'Назначьте следующий звонок.'
  if (d.schedule) {
    const next = new Date(`${d.nextDate}T${d.nextTime}`)
    if (!d.nextDate || !d.nextTime || Number.isNaN(next.getTime())) return 'Укажите дату и время следующего звонка.'
    if (!validDate(next,d.nextDate,d.nextTime)) return 'Укажите существующую дату и время следующего звонка.'
    if (next <= now) return 'Следующий звонок должен быть в будущем.'
  }
  return ''
}
// The two rows are inserted by one PostgREST request, hence one DB transaction.
export function quickCallRows(userId: string, d: QuickCallDraft, relatedClientType?: string) {
  const title = d.name.trim() || d.phone.trim()
  const metadata = { client_id: d.clientId || undefined, contact_name: d.name.trim(), phone: d.phone.trim(), status: d.status, call_type: d.type, contact_method: 'Телефон', next_contact_at: d.schedule ? `${d.nextDate}T${d.nextTime}` : '' }
  const rows: Record<string, unknown>[] = [{ id: d.id, user_id: userId, type: 'meeting', title, event_date: d.date, event_time: null, is_completed: true, related_client_id: null, related_client_type: null, external_key: `call-log:${d.id}`, notes: `kvartocrm-call-v1:${JSON.stringify({ occurred_at: new Date(`${d.date}T${d.time}`).toISOString(), source: null, outcome: d.status, notes: d.notes.trim() || null, metadata })}` }]
  if (d.schedule) rows.push({ id: d.nextId, user_id: userId, type: 'call', title: `Перезвонить: ${title}`, event_date: d.nextDate, event_time: d.nextTime, is_completed: false, external_key: `follow-up:${d.id}`, notes: d.notes.trim() || null, related_client_id: d.clientId || null, related_client_type: relatedClientType || null })
  return rows
}
