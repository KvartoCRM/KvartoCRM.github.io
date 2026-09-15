import type { Deal } from '../types'
import { indexDealFinance, mergeDealFinance, readDealFinance } from './dealFinance.ts'
import { indexDealParticipants, participantIdsWithLegacyFallback, type DealParticipantRow } from './dealParticipants.ts'

export type DealUpsertInput = {
  propertyId: string
  buyerIds: string[]
  ownerIds: string[]
  price?: number
  agencyIncome?: number
  agentIncome?: number
  expenses?: number
  stage?: Deal['stage']
  lossReason?: string
  checklist?: NonNullable<Deal['checklist']>
  status: Deal['status']
  notes?: string
}

export type DealRecord = Deal & { financeActivityId?: string }

type CloudRow = Record<string, unknown>
type FinanceRow = CloudRow & { id?: string | null; external_key?: string | null; metadata?: Record<string, unknown> | null }

const optionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const mapDealRows = (
  dealRows: CloudRow[],
  financeRows: FinanceRow[],
  participantRows: DealParticipantRow[],
): DealRecord[] => {
  const financeByDeal = indexDealFinance(financeRows)
  const financeIds = new Map(financeRows.flatMap(row => {
    const key = typeof row.external_key === 'string' ? row.external_key.replace(/^deal-finance:/, '') : ''
    return key && row.id ? [[key, String(row.id)] as const] : []
  }))
  const participantsByDeal = indexDealParticipants(participantRows)

  return dealRows.map(row => {
    const id = String(row.id)
    const participants = participantsByDeal.get(id)
    const buyerIds = participantIdsWithLegacyFallback(participants?.buyerIds, typeof row.buyer_id === 'string' ? row.buyer_id : undefined)
    const ownerIds = participantIdsWithLegacyFallback(participants?.ownerIds)
    const finance = mergeDealFinance(financeByDeal.get(id), readDealFinance(row))
    return {
      id,
      userId: typeof row.user_id === 'string' ? row.user_id : undefined,
      propertyId: typeof row.property_id === 'string' ? row.property_id : '',
      buyerId: buyerIds[0],
      buyerIds,
      ownerId: ownerIds[0],
      ownerIds,
      price: optionalNumber(row.price),
      agencyIncome: finance.agencyIncome,
      agentIncome: finance.agentIncome,
      expenses: optionalNumber(row.expenses) ?? 0,
      stage: row.stage === 'documents' || row.stage === 'approval' || row.stage === 'registration' || row.stage === 'settlement' || row.stage === 'completed' || row.stage === 'lost'
        ? row.stage
        : 'preparation',
      lossReason: typeof row.loss_reason === 'string' ? row.loss_reason : undefined,
      checklist: Array.isArray(row.checklist)
        ? row.checklist.filter(item => item && typeof item === 'object').map(item => {
          const checklistItem = item as Record<string, unknown>
          return {
            id: typeof checklistItem.id === 'string' ? checklistItem.id : crypto.randomUUID(),
            title: typeof checklistItem.title === 'string' ? checklistItem.title : '',
            completed: checklistItem.completed === true,
          }
        }).filter(item => item.title)
        : [],
      financeActivityId: financeIds.get(id),
      status: row.status === 'pending' || row.status === 'closed' || row.status === 'cancelled' ? row.status : 'active',
      notes: typeof row.notes === 'string' ? row.notes : undefined,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : typeof row.created_at === 'string' ? row.created_at : '',
    }
  })
}

export const dealFromInput = (
  userId: string,
  id: string,
  financeActivityId: string,
  input: DealUpsertInput,
  previous?: DealRecord,
): DealRecord => ({
  ...previous,
  id,
  userId,
  propertyId: input.propertyId,
  buyerId: input.buyerIds[0],
  buyerIds: input.buyerIds,
  ownerId: input.ownerIds[0],
  ownerIds: input.ownerIds,
  price: input.price,
  agencyIncome: input.agencyIncome,
  agentIncome: input.agentIncome,
  expenses: input.expenses ?? 0,
  stage: input.stage ?? 'preparation',
  lossReason: input.lossReason,
  checklist: input.checklist ?? [],
  financeActivityId,
  status: input.status,
  notes: input.notes,
  createdAt: previous?.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})
