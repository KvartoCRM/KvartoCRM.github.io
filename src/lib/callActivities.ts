import { callFromInput, mapCallActivityRow, type CallActivityInput, type WorkCall } from './callActivityMapping'
import { fetchAllRows } from './pagination'
import { supabase } from './supabase'
import { moveToTrash } from './trash'

export const fetchCallActivities = async (userId: string): Promise<WorkCall[]> => {
  const { data, error } = await fetchAllRows(() => supabase
    .from('crm_activities')
    .select('id,title,occurred_at,source,outcome,notes,metadata')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .eq('type', 'call')
    .eq('status', 'completed'))
  if (error) throw error
  return data.map(mapCallActivityRow).sort((left, right) => String(right.occurred_at).localeCompare(String(left.occurred_at)))
}

export const saveCallActivity = async (userId: string, input: CallActivityInput, callId?: string, newCallId?: string) => {
  const id = callId || newCallId || crypto.randomUUID()
  const payload = {
    user_id: userId,
    type: 'call',
    status: 'completed',
    title: input.title,
    occurred_at: input.occurred_at,
    due_at: input.dueAt || null,
    source: input.source,
    outcome: input.outcome,
    notes: input.notes,
    metadata: input.metadata,
  }
  const result = callId
    ? await supabase.from('crm_activities').update(payload).eq('id', callId).eq('user_id', userId)
      .select('id,title,occurred_at,source,outcome,notes,metadata').single()
    : await supabase.from('crm_activities').insert({ ...payload, id })
      .select('id,title,occurred_at,source,outcome,notes,metadata').single()
  if (result.error) throw result.error
  if (!result.data?.id) throw new Error('Сервер не подтвердил сохранение звонка')
  return { id, input }
}

export const trashCallActivity = async (userId: string, callId: string) => {
  await moveToTrash('crm_activities', callId, userId)
  return callId
}

export const makeSavedCall = (id: string, input: CallActivityInput) => callFromInput(id, input)
