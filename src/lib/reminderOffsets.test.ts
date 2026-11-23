import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskReminderOffsets } from './reminderOffsets.ts'
test('old and new tasks default to due time only', () => {
  for (const value of [undefined, null, [], {}, '60']) assert.deepEqual(taskReminderOffsets(value), [0])
})
test('multiple choices retain due time and discard invalid or repeated values', () => {
  assert.deepEqual(taskReminderOffsets([60, 1440, 60, 0, -5, '5']), [1440, 60, 0])
  assert.deepEqual(taskReminderOffsets([5]), [5, 0])
})
