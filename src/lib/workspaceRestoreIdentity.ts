import type { WorkspaceBackup, BackupRow } from './workspaceBackupFormat.ts'

export const restoreStoragePath = (path: string, sourceUserId: string, userId: string) => {
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === sourceUserId || parts[0] === userId) parts.shift()
  return sourceUserId === userId
    ? [userId, ...parts].join('/')
    : [userId, 'imported', sourceUserId, ...parts].join('/')
}

// Stable per destination: retrying the same import updates its own copies,
// never the records belonging to the source account.
export const prepareRestoreIdentity = async (backup: WorkspaceBackup, userId: string): Promise<WorkspaceBackup> => {
  if (backup.sourceUserId === userId) return backup
  const ids = new Set<string>()
  for (const rows of Object.values(backup.tables)) for (const row of rows) {
    if (typeof row.id === 'string') ids.add(row.id)
    if (typeof row.slug === 'string') ids.add(row.slug)
  }
  const replacements = new Map<string, string>()
  for (const id of ids) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['kvartocrm-import-v1', userId, backup.sourceUserId, id]))))
    bytes[6] = (bytes[6] & 15) | 80
    bytes[8] = (bytes[8] & 63) | 128
    const hex = Array.from(bytes.slice(0, 16), value => value.toString(16).padStart(2, '0')).join('')
    replacements.set(id, `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`)
  }
  const rewrite = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map(item => rewrite(item, key))
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([field, item]) => [field, rewrite(item, field)]))
    if (typeof value !== 'string') return value
    if (key === 'user_id') return userId
    if (key === 'id' || key === 'slug' || /(?:_id|_ids|Id|Ids)$/.test(key)) return replacements.get(value) || value
    if (key === 'external_key' && value.startsWith('call-log:')) return `call-log:${replacements.get(value.slice(9)) || value.slice(9)}`
    if (key === 'notes' && value.startsWith('kvartocrm-call-v1:')) {
      try { return `kvartocrm-call-v1:${JSON.stringify(rewrite(JSON.parse(value.slice('kvartocrm-call-v1:'.length))))}` } catch { return value }
    }
    return value
  }
  const tables = Object.fromEntries(Object.entries(backup.tables).map(([table, rows]) => [table, rows.map(row => {
    const next = rewrite(row) as BackupRow
    // Importing records must not silently publish another account's shares.
    if (table === 'property_shares') next.active = false
    return next
  })]))
  return { ...backup, profile: null, tables, fileUrls: Object.fromEntries(Object.entries(backup.fileUrls).map(([id, url]) => [replacements.get(id) || id, url])), warnings: [...backup.warnings, 'Копия перенесена с новыми идентификаторами. Профиль текущего аккаунта сохранён, публичные ссылки из копии отключены.'] }
}
