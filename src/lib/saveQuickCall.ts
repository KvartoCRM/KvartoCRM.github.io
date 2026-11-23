import { sameQuickCallRow, QuickCallConflictError } from './quickCallConfirmation'
import {stopCallFollowups} from './callFollowups'
import { supabase } from './supabase'
import { quickCallRows, type QuickCallDraft } from './quickCall'

export async function saveQuickCall(userId: string, draft: QuickCallDraft, relatedClientType?: string, completedEventId?: string) {
  const rows = quickCallRows(userId, draft, relatedClientType)
  // One transaction returns its persisted records; no separate REST read is needed.
  const result = await supabase.rpc('save_quick_call', { p_rows: rows })
  if (result.error) throw new Error('Не удалось сохранить звонок: '+result.error.message)
  if (!Array.isArray(result.data)) throw new Error('Сервер не подтвердил сохранение. Повторите с теми же данными.')
  const existing: Record<string,unknown>[] = result.data
  if (existing.length !== rows.length) throw new Error('Сервер не подтвердил все записи. Повторите сохранение с теми же данными.')
  if (!rows.every(row => existing.some(saved => saved.id === row.id && sameQuickCallRow(saved,row)))) throw new QuickCallConflictError(existing)
  await stopCallFollowups(userId,draft.clientId,draft.status,new Date(`${draft.date}T${draft.time}`).toISOString())
  if (completedEventId) {
    const completed = await supabase.from('events').update({ is_completed: true }).eq('id', completedEventId).eq('user_id', userId).select('id').maybeSingle()
    if (completed.error || !completed.data) throw new Error('Итог и следующий звонок сохранены. Не удалось закрыть исходное дело. Повторите сохранение с теми же данными.')
  }
}
