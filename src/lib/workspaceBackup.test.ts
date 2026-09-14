import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkspaceBackup, SERVER_MANAGED_WORKSPACE_TABLES, summarizeWorkspaceBackup } from './workspaceBackupFormat.ts'

const validBackup = {
  format: 'kvartocrm-workspace-backup',
  version: 1,
  exportedAt: '2026-08-29T13:02:26.640Z',
  sourceUserId: 'source-user',
  profile: { id: 'source-user', first_name: 'Денис' },
  tables: {
    clients: [{ id: 'client-1', user_id: 'source-user', first_name: 'Иван' }],
    properties: [{ id: 'property-1', user_id: 'source-user', address: 'Курск' }],
    crm_files: [{ id: 'file-1', user_id: 'source-user', bucket: 'crm-images', storage_path: 'source-user/photo.jpg' }],
  },
  fileUrls: { 'file-1': 'https://example.com/photo.jpg', ignored: 123 },
  warnings: ['Исходное предупреждение', 123],
}

test('parseWorkspaceBackup validates and normalizes a KvartoCRM backup', () => {
  const backup = parseWorkspaceBackup(JSON.stringify(validBackup))
  assert.equal(backup.format, 'kvartocrm-workspace-backup')
  assert.equal(backup.tables.clients.length, 1)
  assert.equal(backup.tables.tasks.length, 0)
  assert.deepEqual(backup.fileUrls, { 'file-1': 'https://example.com/photo.jpg' })
  assert.deepEqual(backup.warnings, ['Исходное предупреждение'])
})

test('summarizeWorkspaceBackup counts records and file metadata', () => {
  const summary = summarizeWorkspaceBackup(parseWorkspaceBackup(validBackup))
  assert.equal(summary.totalRows, 3)
  assert.equal(summary.fileRecords, 1)
  assert.deepEqual(summary.tableCounts.map(item => item.table), ['clients', 'properties', 'crm_files'])
})

test('parseWorkspaceBackup rejects unrelated and malformed files', () => {
  assert.throws(() => parseWorkspaceBackup('{bad json'), /корректным JSON/)
  assert.throws(() => parseWorkspaceBackup({ ...validBackup, format: 'another-app' }), /не резервная копия KvartoCRM/)
  assert.throws(() => parseWorkspaceBackup({ ...validBackup, tables: { clients: 'broken' } }), /clients повреждён/)
})

test('parseWorkspaceBackup keeps legacy LumiCRM backups importable', () => {
  const backup = parseWorkspaceBackup({ ...validBackup, format: 'lumicrm-workspace-backup' })
  assert.equal(backup.format, 'kvartocrm-workspace-backup')
})

test('restore skips notifications that only server-side jobs may create', () => {
  assert.equal(SERVER_MANAGED_WORKSPACE_TABLES.includes('notifications'), true)
  assert.equal(SERVER_MANAGED_WORKSPACE_TABLES.includes('notification_jobs'), true)
  assert.equal(SERVER_MANAGED_WORKSPACE_TABLES.includes('push_subscriptions'), true)
  assert.equal(SERVER_MANAGED_WORKSPACE_TABLES.includes('events'), false)
})
