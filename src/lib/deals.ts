import { dealFinanceKey } from './dealFinance'
import { dealFromInput, mapDealRows, type DealRecord, type DealUpsertInput } from './dealMapping'
import { makeDealParticipantRows, type DealParticipantRow } from './dealParticipants'
import { supabase } from './supabase'
import { fetchAllRows } from './pagination'
import { moveToTrash } from './trash'

export const fetchDeals = async (userId: string): Promise<DealRecord[]> => {
  const [dealsResult, financeResult, participantsResult] = await Promise.all([
    fetchAllRows(() => supabase.from('deals').select('*').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false })),
    fetchAllRows(() => supabase.from('crm_activities').select('id,external_key,metadata,created_at,updated_at').eq('user_id', userId).ilike('external_key', 'deal-finance:%').is('deleted_at', null).order('updated_at', { ascending: true })),
    fetchAllRows(() => supabase.from('deal_participants').select('id,deal_id,client_id,role').eq('user_id', userId)),
  ])
  const firstError = [dealsResult.error, financeResult.error, participantsResult.error].find(Boolean)
  if (firstError) throw firstError
  return mapDealRows(
    dealsResult.data || [],
    financeResult.data || [],
    (participantsResult.data || []) as DealParticipantRow[],
  )
}

export const saveDeal = async (
  userId: string,
  input: DealUpsertInput,
  dealId?: string,
  newDealId?: string,
  existingFinanceActivityId?: string,
  newFinanceActivityId?: string,
) => {
  const id = dealId || newDealId || crypto.randomUUID()
  const financeId = existingFinanceActivityId || newFinanceActivityId || crypto.randomUUID()
  const buyerIds = [...new Set(input.buyerIds.filter(Boolean))]
  const ownerIds = [...new Set(input.ownerIds.filter(Boolean))]
  if (!input.propertyId || buyerIds.length === 0 || ownerIds.length === 0) {
    throw new Error('Выберите объект, покупателя и собственника')
  }

  const { error: propertyError } = await supabase
    .from('properties')
    .update({ owner_id: ownerIds[0] })
    .eq('id', input.propertyId)
    .eq('user_id', userId)
  if (propertyError) throw propertyError

  const payload = {
    user_id: userId,
    property_id: input.propertyId,
    buyer_id: buyerIds[0],
    price: input.price ?? null,
    status: input.status,
    stage: input.stage ?? 'preparation',
    expenses: input.expenses ?? 0,
    loss_reason: input.lossReason || null,
    checklist: input.checklist ?? [],
    notes: input.notes || null,
  }
  const dealResult = dealId
    ? await supabase.from('deals').update(payload).eq('id', dealId).eq('user_id', userId)
    : await supabase.from('deals').insert({ ...payload, id })
  if (dealResult.error) throw dealResult.error

  const { error: removeParticipantsError } = await supabase
    .from('deal_participants')
    .delete()
    .eq('deal_id', id)
    .eq('user_id', userId)
  if (removeParticipantsError) throw removeParticipantsError

  const participantRows = makeDealParticipantRows(userId, id, buyerIds, ownerIds)
    .map(row => ({ ...row, id: crypto.randomUUID() }))
  const { error: participantsError } = await supabase.from('deal_participants').insert(participantRows)
  if (participantsError) throw participantsError

  const financePayload = {
    user_id: userId,
    property_id: input.propertyId,
    type: 'note',
    status: 'completed',
    title: 'Финансы сделки',
    occurred_at: input.status === 'closed' ? new Date().toISOString() : null,
    external_key: dealFinanceKey(id),
    metadata: {
      deal_id: id,
      final_amount: input.price ?? null,
      agency_income: input.agencyIncome ?? null,
      agent_income: input.agentIncome ?? null,
    },
  }
  const financeResult = existingFinanceActivityId
    ? await supabase.from('crm_activities').update(financePayload).eq('id', existingFinanceActivityId).eq('user_id', userId)
    : await supabase.from('crm_activities').insert({ ...financePayload, id: financeId })
  if (financeResult.error) throw financeResult.error

  return { id, financeActivityId: financeId }
}

export const trashDeal = async (userId: string, dealId: string) => {
  await moveToTrash('deals', dealId, userId)
  return dealId
}

export const makeSavedDeal = (
  userId: string,
  id: string,
  financeActivityId: string,
  input: DealUpsertInput,
  previous?: DealRecord,
) => dealFromInput(userId, id, financeActivityId, input, previous)
