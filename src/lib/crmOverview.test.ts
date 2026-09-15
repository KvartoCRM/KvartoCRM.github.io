import assert from 'node:assert/strict'
import test from 'node:test'
import { countContactsByRole, isActiveDealRow } from './crmOverview.ts'

test('dashboard counts modern roles and legacy primary types together', () => {
  const rows = [
    { id: 'modern-owner', type: 'buyer', roles: ['buyer', 'seller'] },
    { id: 'legacy-owner', type: 'seller', roles: [] },
    { id: 'buyer', type: 'buyer', roles: ['buyer'] },
  ]

  assert.equal(countContactsByRole(rows, 'seller'), 2)
  assert.equal(countContactsByRole(rows, 'buyer'), 2)
})

test('dashboard treats every non-terminal legacy deal status as active', () => {
  assert.equal(isActiveDealRow({ status: 'active' }), true)
  assert.equal(isActiveDealRow({ status: 'pending' }), true)
  assert.equal(isActiveDealRow({ status: 'in_progress' }), true)
  assert.equal(isActiveDealRow({ status: 'closed' }), false)
  assert.equal(isActiveDealRow({ status: 'cancelled' }), false)
})
