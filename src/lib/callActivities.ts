import { callEventKey, callFromInput, encodeCallEvent, mapCallActivityRow, mapCallEventRow, type CallActivityInput, type WorkCall } from './callActivityMapping'
import { fetchAllRows } from './pagination'
import { supabase } from './supabase'
import { moveToTrash } from './trash'

export const fetchCallActivities = async (userId: string): Promise<WorkCall[]> => {
  const [eventsResult, legacyResult] = await Promise.all([
    fetchAllRows(() => supabase.from('events').select('id,title,notes,external_key').eq('user_id', userId).is('deleted_at', null).eq('type', 'call')),
    fetchAllRows(() => supabase.from('crm_activities').select('id,title,occurred_at,source,outcome,notes,metadata').eq('user_id', userId).is('deleted_at', null).eq('type', 'call').eq('status', 'completed')),
  ])
  if (eventsResult.error) throw eventsResult.error
  const modern = eventsResult.data.map(mapCallEventRow).filter((call): call is WorkCall => Boolean(call))
  const legacy = legacyResult.error ? [] : legacyResult.data.map(mapCallActivityRow)
  const byId = new Map<string, WorkCall>()
  legacy.forEach(call => byId.set(call.id, call))
  modern.forEach(call => byId.set(call.id, call))
  return [...byId.values()].sort((left, right) => String(right.occurred_at).localeCompare(String(left.occurred_at)))
}

export const saveCallActivity = async (userId: string, input: CallActivityInput, callId?: string, newCallId?: string) => {
  const id = callId || newCallId || crypto.randomUUID()
  const occurred = new Date(input.occurred_at || new Date().toISOString())
  const payload = {
    user_id: userId,
    type: 'call',
    title: input.title,
    event_date: occurred.toISOString().slice(0, 10),
    event_time: occurred.toISOString().slice(11, 19),
    notes: encodeCallEvent(input),
    external_key: callEventKey(id),
  }
  const result = await supabase.from('events').upsert({ ...payload, id }, { onConflict: 'id' })
    .select('id,title,notes,external_key').single()
  if (result.error) throw result.error
  if (!result.data?.id) throw new Error('Сервер не подтвердил сохранение звонка')
  return { id, input }
}

export const trashCallActivity = async (userId: string, callId: string) => {
  await Promise.allSettled([
    moveToTrash('events', callId, userId),
    moveToTrash('crm_activities', callId, userId),
  ])
  return callId
}

export const makeSavedCall = (id: string, input: CallActivityInput) => callFromInput(id, input)
