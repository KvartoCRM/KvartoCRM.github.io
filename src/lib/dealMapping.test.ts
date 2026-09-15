import assert from 'node:assert/strict'
import test from 'node:test'
import { dealFromInput, mapDealRows } from './dealMapping.ts'

test('maps deal participants and separate finance values', () => {
  const [deal] = mapDealRows([
    { id: 'deal-1', user_id: 'user-1', property_id: 'property-1', buyer_id: 'legacy-buyer', price: 8_300_000, status: 'closed', stage: 'settlement', expenses: 15_000, checklist: [{ id: 'item-1', title: 'Акт', completed: true }], created_at: '2026-08-01' },
  ], [
    { id: 'finance-1', external_key: 'deal-finance:deal-1', metadata: { agency_income: 200_000, agent_income: 80_000 } },
  ], [
    { deal_id: 'deal-1', client_id: 'buyer-1', role: 'buyer' },
    { deal_id: 'deal-1', client_id: 'owner-1', role: 'owner' },
  ])

  assert.deepEqual(deal.buyerIds, ['buyer-1'])
  assert.deepEqual(deal.ownerIds, ['owner-1'])
  assert.equal(deal.agencyIncome, 200_000)
  assert.equal(deal.agentIncome, 80_000)
  assert.equal(deal.financeActivityId, 'finance-1')
  assert.equal(deal.stage, 'settlement')
  assert.equal(deal.expenses, 15_000)
  assert.deepEqual(deal.checklist, [{ id: 'item-1', title: 'Акт', completed: true }])
})

test('creates optimistic deal with durable participant and finance data', () => {
  const deal = dealFromInput('user-1', 'deal-1', 'finance-1', {
    propertyId: 'property-1',
    buyerIds: ['buyer-1', 'buyer-2'],
    ownerIds: ['owner-1', 'owner-2'],
    price: 5_000_000,
    agencyIncome: 150_000,
    agentIncome: 75_000,
    expenses: 5_000,
    stage: 'documents',
    checklist: [{ id: 'item-1', title: 'Проверить договор', completed: false }],
    status: 'active',
    notes: 'Проверить документы',
  })

  assert.equal(deal.id, 'deal-1')
  assert.deepEqual(deal.buyerIds, ['buyer-1', 'buyer-2'])
  assert.deepEqual(deal.ownerIds, ['owner-1', 'owner-2'])
  assert.equal(deal.financeActivityId, 'finance-1')
  assert.equal(deal.expenses, 5_000)
  assert.equal(deal.stage, 'documents')
  assert.equal(deal.checklist?.length, 1)
})

test('maps legacy finance stored directly on a deal when an activity is absent', () => {
  const [deal] = mapDealRows([
    { id: 'deal-legacy', property_id: 'property-1', price: 4_000_000, agency_income: '180000', agent_income: 70000, status: 'closed' },
  ], [], [])
  assert.equal(deal.agencyIncome, 180000)
  assert.equal(deal.agentIncome, 70000)
})

test('maps embedded finance without exposing its service checklist item', () => {
  const [deal] = mapDealRows([{
    id: 'deal-snapshot', property_id: 'property-1', status: 'closed',
    checklist: [
      { id: 'visible', title: 'Проверить договор', completed: false },
      { id: 'kvartocrm:deal-finance', title: '', completed: true, agency_income: 190000, agent_income: 95000 },
    ],
  }], [], [])
  assert.equal(deal.agencyIncome, 190000)
  assert.equal(deal.agentIncome, 95000)
  assert.deepEqual(deal.checklist, [{ id: 'visible', title: 'Проверить договор', completed: false }])
})
