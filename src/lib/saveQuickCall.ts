import { sameQuickCallRow, QuickCallConflictError } from './quickCallConfirmation'
import {stopCallFollowups} from './callFollowups'
import { supabase } from './supabase'
import { quickCallRows, type QuickCallDraft } from './quickCall'

export async function saveQuickCall(userId: string, draft: QuickCallDraft, relatedClientType?: string, completedEventId?: string) {
  const rows = quickCallRows(userId, draft, relatedClientType)
  const result = await supabase.from('events').insert(rows)
  if (result.error && result.error.code !== '23505') throw result.error
  // An uncertain prior response may have committed successfully. Confirm all
  // stable IDs and payloads; never overwrite an already edited appointment.
  // Read each stable ID directly from the network. A missing/cached response
  // is not evidence of a conflicting record.
  const confirmations = await Promise.all(rows.map(row => supabase.from('events').select('*')
    .eq('user_id', userId).eq('id', String(row.id)).setHeader('x-lumicrm-network-only', 'true').maybeSingle()))
  for (const response of confirmations) if (response.error) throw response.error
  if (confirmations.some(response => !response.data)) throw new Error('Не удалось получить подтверждение с сервера. Повторите сохранение с теми же данными: повторный звонок не будет создан.')
  const existing = confirmations.map(response => response.data!)
  if (!rows.every((row, index) => sameQuickCallRow(existing[index], row))) throw new QuickCallConflictError(existing)
  await stopCallFollowups(userId,draft.clientId,draft.status,new Date(`${draft.date}T${draft.time}`).toISOString())
  if (completedEventId) {
    const completed = await supabase.from('events').update({ is_completed: true }).eq('id', completedEventId).eq('user_id', userId).select('id').maybeSingle()
    if (completed.error || !completed.data) throw new Error('Итог и следующий звонок сохранены. Не удалось закрыть исходное дело. Повторите сохранение с теми же данными.')
  }
}
