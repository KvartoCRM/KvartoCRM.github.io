import { callEventKey, callFromInput, encodeCallEvent, mapCallActivityRow, mapCallEventRow, type CallActivityInput, type WorkCall } from './callActivityMapping'
import { fetchAllRows } from './pagination'
import { supabase } from './supabase'
import { moveToTrash } from './trash'

export const fetchCallActivities = async (userId: string): Promise<WorkCall[]> => {
  const readModern = (networkOnly: boolean) => fetchAllRows(() => {
    const query = supabase.from('events').select('id,title,notes,external_key').eq('user_id', userId).is('deleted_at', null).like('external_key', 'call-log:%')
    return networkOnly ? query.setHeader('x-lumicrm-network-only', 'true') : query
  })
  const modernPromise = typeof navigator !== 'undefined' && navigator.onLine
    ? readModern(true).catch(() => readModern(false))
    : readModern(false)
  const [eventsResult, legacyResult] = await Promise.allSettled([
    modernPromise,
    fetchAllRows(() => supabase.from('crm_activities').select('id,title,occurred_at,source,outcome,notes,metadata').eq('user_id', userId).is('deleted_at', null).eq('type', 'call').eq('status', 'completed')),
  ])
  if (eventsResult.status === 'rejected') throw eventsResult.reason
  const modern = eventsResult.value.data.map(mapCallEventRow).filter((call): call is WorkCall => Boolean(call))
  const legacy = legacyResult.status === 'fulfilled' ? legacyResult.value.data.map(mapCallActivityRow) : []
  console.info('[KvartoCRM calls diagnostic]', JSON.stringify({
    userSuffix: userId.slice(-8),
    modernRows: eventsResult.value.data.length,
    modernMapped: modern.length,
    legacyRows: legacyResult.status === 'fulfilled' ? legacyResult.value.data.length : null,
    legacyFailed: legacyResult.status === 'rejected',
  }))
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
    // The deployed database has historically treated scheduled `call` events
    // inconsistently. A completed journal record uses the proven meeting row
    // path and is identified exclusively by its private call-log key.
    type: 'meeting',
    title: input.title,
    event_date: occurred.toISOString().slice(0, 10),
    event_time: null,
    is_completed: true,
    notes: encodeCallEvent(input),
    external_key: callEventKey(id),
  }
  // Use the same mutation path as calendar events. On some mobile/regional
  // routes PostgREST sends the success headers immediately but stalls while
  // streaming `return=representation`; waiting for that body made a locally
  // optimistic call appear saved even though it later fell out of sync.
  const result = callId
    ? await supabase.from('events').update(payload).eq('id', callId).eq('user_id', userId)
    : await supabase.from('events').insert({ ...payload, id })
  if (result.error) throw result.error
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
