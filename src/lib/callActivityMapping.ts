export type CallType = 'cold' | 'warm' | 'inbound' | 'selection'

export interface CallMetadata {
  call_type: CallType
  status: string
  contact_method: string
  contact_name: string
  phone: string
  address: string
  property_type: string
  demand: string
  unsuitable: string
  property_url: string
  area: string
  floor: string
  price: string
  contacted_at: string
  next_contact_at: string
  meeting_at: string
  second_touch_at: string
  second_comment: string
}

export interface WorkCall {
  id: string
  title: string
  occurred_at: string | null
  source: string | null
  outcome: string | null
  notes: string | null
  metadata: Partial<CallMetadata> | null
}

export type CallActivityInput = Omit<WorkCall, 'id'> & { dueAt?: string | null }

type CloudCallRow = Record<string, unknown>
const CALL_EVENT_MARKER = 'kvartocrm-call-v1:'

export const callEventKey = (id: string) => `call-log:${id}`

export const encodeCallEvent = (input: CallActivityInput) => `${CALL_EVENT_MARKER}${JSON.stringify({
  occurred_at: input.occurred_at,
  source: input.source,
  outcome: input.outcome,
  notes: input.notes,
  metadata: input.metadata,
})}`

export const mapCallEventRow = (row: CloudCallRow): WorkCall | null => {
  if (typeof row.external_key !== 'string' || !row.external_key.startsWith('call-log:')) return null
  if (typeof row.notes !== 'string' || !row.notes.startsWith(CALL_EVENT_MARKER)) return null
  try {
    const payload = JSON.parse(row.notes.slice(CALL_EVENT_MARKER.length)) as Partial<CallActivityInput>
    return {
      id: String(row.id),
      title: typeof row.title === 'string' ? row.title : '',
      occurred_at: typeof payload.occurred_at === 'string' ? payload.occurred_at : null,
      source: typeof payload.source === 'string' ? payload.source : null,
      outcome: typeof payload.outcome === 'string' ? payload.outcome : null,
      notes: typeof payload.notes === 'string' ? payload.notes : null,
      metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : null,
    }
  } catch {
    return null
  }
}

export const mapCallActivityRow = (row: CloudCallRow): WorkCall => ({
  id: String(row.id),
  title: typeof row.title === 'string' ? row.title : '',
  occurred_at: typeof row.occurred_at === 'string' ? row.occurred_at : null,
  source: typeof row.source === 'string' ? row.source : null,
  outcome: typeof row.outcome === 'string' ? row.outcome : null,
  notes: typeof row.notes === 'string' ? row.notes : null,
  metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata as Partial<CallMetadata> : null,
})

export const callFromInput = (id: string, input: CallActivityInput): WorkCall => ({
  id,
  title: input.title,
  occurred_at: input.occurred_at,
  source: input.source,
  outcome: input.outcome,
  notes: input.notes,
  metadata: input.metadata,
})
