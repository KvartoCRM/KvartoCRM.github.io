import assert from 'node:assert/strict'
import test from 'node:test'
import { describeQueueIssue, isNetworkFailure } from './syncDiagnostics.ts'

const issue = { id: '1', table: 'tasks', method: 'PATCH', createdAt: 1, attempts: 1 }

test('explains authentication and conflict failures in plain language', () => {
  assert.deepEqual(describeQueueIssue({ ...issue, lastError: 'HTTP 403: forbidden' }), {
    entity: 'Задача',
    reason: 'Требуется повторный вход в аккаунт',
  })
  assert.equal(describeQueueIssue({ ...issue, lastError: 'HTTP 409: conflict' }).reason, 'Данные изменились на другом устройстве')
})

test('falls back to a generic entity and retry message', () => {
  assert.deepEqual(describeQueueIssue({ ...issue, table: 'unknown' }), {
    entity: 'Запись',
    reason: 'Отправка будет повторена',
  })
})

test('distinguishes transport failures from rejected sessions', () => {
  assert.equal(isNetworkFailure({ message: 'Failed to fetch' }), true)
  assert.equal(isNetworkFailure({ name: 'TimeoutError', message: 'Network request timed out' }), true)
  assert.equal(isNetworkFailure({ status: 503, message: 'Unavailable' }), true)
  assert.equal(isNetworkFailure({ status: 401, message: 'Invalid JWT' }), false)
})
