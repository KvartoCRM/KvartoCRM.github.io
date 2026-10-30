import { supabase } from './supabase'
import { quickCallRows, type QuickCallDraft } from './quickCall'

export async function saveQuickCall(userId: string, draft: QuickCallDraft, relatedClientType?: string, completedEventId?: string) {
  const rows = quickCallRows(userId, draft, relatedClientType)
  const result = await supabase.from('events').insert(rows)
  if (result.error && result.error.code !== '23505') throw result.error
  // An uncertain prior response may have committed successfully. Confirm all
  // stable IDs and payloads; never overwrite an already edited appointment.
  const confirmation = await supabase.from('events').select('*').eq('user_id', userId).in('id', rows.map(row => String(row.id)))
  if (confirmation.error) throw confirmation.error
  const exact = rows.every(row => {
    const saved = confirmation.data?.find(item => item.id === row.id)
    return saved && !saved.deleted_at && Object.entries(row).every(([key, value]) => key === 'event_time' && value ? String(saved[key]).slice(0,5) === value : saved[key] === value)
  })
  if (!exact) throw new Error('Эта запись уже сохранена с другими данными. Проверьте журнал и календарь перед новой записью.')
  if (completedEventId) {
    const completed = await supabase.from('events').update({ is_completed: true }).eq('id', completedEventId).eq('user_id', userId).select('id').maybeSingle()
    if (completed.error || !completed.data) throw new Error('Итог и следующий звонок сохранены. Не удалось закрыть исходное дело. Повторите сохранение с теми же данными.')
  }
}
