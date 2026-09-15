import assert from 'node:assert/strict'
import test from 'node:test'
import { callEventKey, callFromInput, encodeCallEvent, mapCallActivityRow, mapCallEventRow } from './callActivityMapping.ts'

test('maps a completed call activity', () => {
  const call = mapCallActivityRow({
    id: 'call-1',
    title: 'Иван',
    occurred_at: '2026-09-01T10:00:00Z',
    metadata: { call_type: 'cold', phone: '+70000000000' },
  })
  assert.equal(call.metadata?.call_type, 'cold')
  assert.equal(call.metadata?.phone, '+70000000000')
})

test('keeps the optimistic call id and details', () => {
  const call = callFromInput('call-local', {
    title: 'Анна',
    occurred_at: null,
    source: 'Авито',
    outcome: null,
    notes: null,
    metadata: { call_type: 'inbound' },
  })
  assert.equal(call.id, 'call-local')
  assert.equal(call.source, 'Авито')
})

test('round-trips a complete call through a durable calendar event', () => {
  const input = {
    title: 'Тестовый звонок', occurred_at: '2026-09-15T10:00:00.000Z', source: 'Сайт', outcome: 'Встреча', notes: 'Комментарий',
    metadata: { call_type: 'warm' as const, phone: '+79990000000' },
  }
  const id = '00000000-0000-4000-8000-000000000001'
  const mapped = mapCallEventRow({ id, title: input.title, external_key: callEventKey(id), notes: encodeCallEvent(input) })
  assert.equal(mapped?.metadata?.phone, '+79990000000')
  assert.equal(mapped?.source, 'Сайт')
  assert.equal(mapped?.outcome, 'Встреча')
})
