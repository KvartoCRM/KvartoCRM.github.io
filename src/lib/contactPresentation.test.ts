import assert from 'node:assert/strict'
import test from 'node:test'
import { contactName, contactInitials, localDate } from './contactPresentation.ts'
import { encodeCallEvent, mapCallEventRow, callEventKey } from './callActivityMapping.ts'

test('contacts display correctly without surname and hide historical placeholders', () => {
  assert.equal(contactName({ firstName: 'Анна', lastName: '' }), 'Анна')
  assert.equal(contactName({ firstName: 'Анна', lastName: 'None' }), 'Анна')
  assert.equal(contactInitials({ firstName: 'Анна', lastName: 'None' }), 'А')
  assert.equal(contactName({ firstName: 'Анна', lastName: 'Нонова' }), 'Анна Нонова')
  assert.equal(localDate(new Date(2026, 9, 1)), '2026-10-01')
})

test('quick-call contact association and outcome survive the persisted event format', () => {
  const input = { title: 'Анна', occurred_at: '2026-10-23T10:00:00Z', source: null, outcome: 'Не ответил', notes: 'Позвонить позже', metadata: { client_id: 'client-1', contact_name: 'Анна', status: 'Не ответил' } }
  const decoded = mapCallEventRow({ id: 'call-1', title: input.title, external_key: callEventKey('call-1'), notes: encodeCallEvent(input) })
  assert.equal(decoded?.metadata?.client_id, 'client-1')
  assert.equal(decoded?.outcome, 'Не ответил')
})
