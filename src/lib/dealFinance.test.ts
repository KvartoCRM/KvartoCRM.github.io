import assert from 'node:assert/strict'
import test from 'node:test'
import { dealFinanceKey, formatMoney, indexDealFinance, isDealFinanceComplete, mergeDealFinance, readDealFinance } from './dealFinance.ts'

test('reads non-negative deal finance values', () => {
  assert.deepEqual(readDealFinance({ agency_income: '200000', agent_income: 75000 }), {
    agencyIncome: 200000,
    agentIncome: 75000,
  })
  assert.deepEqual(readDealFinance({ agency_income: -1, agent_income: 'invalid' }), {
    agencyIncome: undefined,
    agentIncome: undefined,
  })
  assert.deepEqual(readDealFinance({ metadata: { agencyIncome: '125000', finance: { agentIncome: 50000 } } }), {
    agencyIncome: 125000,
    agentIncome: 50000,
  })
  assert.deepEqual(readDealFinance({ agency_income: 90_000, agent_income: 45_000 }), {
    agencyIncome: 90_000,
    agentIncome: 45_000,
  })
})

test('indexes finance records by deal id', () => {
  const index = indexDealFinance([
    { external_key: dealFinanceKey('deal-1'), metadata: { agency_income: 300000, agent_income: 120000 } },
    { external_key: 'another-record', metadata: { agency_income: 900000 } },
  ])
  assert.equal(index.size, 1)
  assert.deepEqual(index.get('deal-1'), { agencyIncome: 300000, agentIncome: 120000 })
})

test('keeps populated values when duplicate legacy finance rows are incomplete', () => {
  const index = indexDealFinance([
    { external_key: dealFinanceKey('deal-1'), metadata: { agency_income: 300000, agent_income: 120000 }, updated_at: '2026-09-14T10:00:00Z' },
    { external_key: dealFinanceKey('deal-1'), metadata: { agency_income: null, agent_income: 125000 }, updated_at: '2026-09-14T11:00:00Z' },
  ])
  assert.deepEqual(index.get('deal-1'), { agencyIncome: 300000, agentIncome: 125000 })
})

test('prefers a finance activity and falls back to legacy deal columns', () => {
  assert.deepEqual(
    mergeDealFinance({ agencyIncome: 250000 }, readDealFinance({ agency_income: 200000, agent_income: 80000 })),
    { agencyIncome: 250000, agentIncome: 80000 },
  )
})

test('formats deal money without treating zero as missing', () => {
  assert.equal(formatMoney(0), '0 ₽')
  assert.equal(formatMoney(undefined), 'Не указано')
})

test('distinguishes zero income from incomplete finance', () => {
  assert.equal(isDealFinanceComplete({ agencyIncome: 0, agentIncome: 0 }), true)
  assert.equal(isDealFinanceComplete({ agencyIncome: 100000 }), false)
})
