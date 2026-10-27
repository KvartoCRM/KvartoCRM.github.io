import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkspaceSearchResults, normalizeSearchTerm } from './workspaceSearchMapping.ts'

test('normalizes unsafe PostgREST search punctuation', () => {
  assert.equal(normalizeSearchTerm('  Ленина, (дом 1)%  '), 'Ленина дом 1')
})

test('maps workspace search rows to the correct routes', () => {
  const results = buildWorkspaceSearchResults([
    [{ id: 'property-1', address: 'Ленина, 1', price: 5_000_000, status: 'available' }],
    [{ id: 'client-1', type: 'buyer', first_name: 'Анна', last_name: 'Иванова', roles: ['tenant'], phone: '79000000000' }],
    [{ id: 'task-1', title: 'Позвонить' }],
    [{ id: 'event-1', title: 'Показ', type: 'meeting', event_date: '2026-09-01' }],
    [{ id: 'deal-1', notes: 'Сделка по Ленина', status: 'active', price: 5_000_000 }],
  ])

  assert.deepEqual(results.map(result => result.kind), ['property', 'client', 'task', 'event', 'deal'])
  assert.equal(results[0].route, '/properties/property-1')
  assert.equal(results[1].route, '/contacts?client=client-1')
  assert.equal(results[1].group, 'Арендаторы')
})
