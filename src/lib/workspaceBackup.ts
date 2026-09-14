import { checkCloudConnection, supabase } from './supabase'
import { getCachedCrmFileBlob } from './offlineFiles'
import type { CrmFileRecord } from './files'
import { fetchAllRows, mapWithConcurrency } from './pagination'
import {
  WORKSPACE_BACKUP_TABLES,
  SERVER_MANAGED_WORKSPACE_TABLES,
  parseWorkspaceBackup,
  type BackupRow,
  type WorkspaceBackup,
  type WorkspaceBackupTable,
  type WorkspaceRestoreProgress,
  type WorkspaceRestoreResult,
} from './workspaceBackupFormat'

export { parseWorkspaceBackup, summarizeWorkspaceBackup } from './workspaceBackupFormat'
export type { BackupRow, WorkspaceBackup, WorkspaceBackupSummary, WorkspaceBackupTable, WorkspaceRestoreProgress, WorkspaceRestoreResult } from './workspaceBackupFormat'

const RESTORE_TABLE_ORDER: WorkspaceBackupTable[] = [
  'clients',
  'client_contact_points',
  'client_relationships',
  'properties',
  'tasks',
  'events',
  'deals',
  'deal_participants',
  'property_owners',
  'property_history',
  'property_details',
  'client_requirements',
  'monthly_plans',
  'property_shares',
  'crm_activities',
  'crm_imports',
  'crm_import_rows',
  'documents',
]

// These tables are either rebuilt by database triggers or belong to a specific device.
const SERVER_MANAGED_TABLES = new Set<WorkspaceBackupTable>(SERVER_MANAGED_WORKSPACE_TABLES)
const UPSERT_BATCH_SIZE = 200

const loadUserTable = async (table: WorkspaceBackupTable, userId: string) => {
  try {
    const { data } = await fetchAllRows(() => supabase.from(table).select('*')
      .eq('user_id', userId).setHeader('x-lumicrm-network-only', 'true'), table === 'property_details' ? 'property_id' : 'id')
    return { rows: data as BackupRow[] }
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error)
    throw new Error(`Резервная копия не создана: ${table}: ${message}`)
  }
}

const buildFileUrls = async (rows: BackupRow[], warnings: string[]) => {
  const result: Record<string, string> = {}
  const byBucket = new Map<string, Array<{ id: string; path: string }>>()

  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : ''
    const bucket = typeof row.bucket === 'string' ? row.bucket : ''
    const path = typeof row.storage_path === 'string' ? row.storage_path : ''
    if (!id || !bucket || !path) continue
    const files = byBucket.get(bucket) ?? []
    files.push({ id, path })
    byBucket.set(bucket, files)
  }

  for (const [bucket, files] of byBucket) {
    for (const batch of chunks(files, 100)) {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(batch.map(file => file.path), 24 * 60 * 60)
      if (error) {
        warnings.push(`Не удалось подготовить ссылки на файлы из ${bucket}: ${error.message}`)
        continue
      }
      data?.forEach((item, index) => {
        if (item.signedUrl && batch[index]) result[batch[index].id] = item.signedUrl
      })
    }
  }

  return result
}

export const createWorkspaceBackup = async (userId: string): Promise<WorkspaceBackup> => {
  const warnings: string[] = []
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).setHeader('x-lumicrm-network-only', 'true').maybeSingle()
  if (profileError) throw new Error(`Резервная копия не создана: профиль: ${profileError.message}`)

  const tableResults = await mapWithConcurrency(WORKSPACE_BACKUP_TABLES, 3, async table => ({ table, ...(await loadUserTable(table, userId)) }))
  const tables: Record<string, BackupRow[]> = {}
  for (const result of tableResults) {
    tables[result.table] = result.rows
  }

  const fileUrls = await buildFileUrls(tables.crm_files ?? [], warnings)
  return parseWorkspaceBackup({
    format: 'kvartocrm-workspace-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceUserId: userId,
    profile: (profile as BackupRow | null) ?? null,
    tables,
    fileUrls,
    warnings,
  })
}

export const downloadWorkspaceBackup = async (userId: string) => {
  const backup = await createWorkspaceBackup(userId)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  anchor.href = url
  anchor.download = `KvartoCRM-backup-${date}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  return backup
}

const chunks = <T,>(items: T[], size: number) => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

const withCurrentUser = (row: BackupRow, userId: string) => ({ ...row, user_id: userId })

const remapStoragePath = (path: string, sourceUserId: string, userId: string) => {
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return `${userId}/restored-file`
  if (parts[0] === sourceUserId || parts[0] === userId) parts[0] = userId
  else parts.unshift(userId)
  return parts.join('/')
}

const fetchBackupFile = async (url: string) => {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.blob()
  } finally {
    window.clearTimeout(timeout)
  }
}

const restoreFileRecords = async (
  backup: WorkspaceBackup,
  userId: string,
  onProgress?: (progress: WorkspaceRestoreProgress) => void,
) => {
  const sourceRows = backup.tables.crm_files ?? []
  const restoredRows: BackupRow[] = []
  const warnings: string[] = []
  let restoredFiles = 0
  let skippedFiles = 0
  let nextIndex = 0
  let completedFiles = 0

  const restoreOne = async (row: BackupRow, index: number) => {
    const id = typeof row.id === 'string' ? row.id : ''
    const bucket = row.bucket === 'crm-images' || row.bucket === 'crm-documents' ? row.bucket : ''
    const sourcePath = typeof row.storage_path === 'string' ? row.storage_path : ''
    if (!id || !bucket || !sourcePath) {
      skippedFiles += 1
      warnings.push(`Файл №${index + 1}: неполная служебная запись.`)
      return
    }

    const storagePath = remapStoragePath(sourcePath, backup.sourceUserId, userId)
    const restoredRow = { ...withCurrentUser(row, userId), storage_path: storagePath }
    const signedUrl = backup.fileUrls[id]
    const sourceFile = { ...row, user_id: backup.sourceUserId } as CrmFileRecord
    let blob = await getCachedCrmFileBlob(sourceFile)
    if (!signedUrl && !blob) {
      if (backup.sourceUserId === userId) restoredRows.push(restoredRow)
      else {
        skippedFiles += 1
        warnings.push(`${String(row.name ?? `Файл №${index + 1}`)}: в копии и локальном кэше нет содержимого.`)
      }
      return
    }

    try {
      blob ??= await fetchBackupFile(signedUrl)
      const { error } = await supabase.storage.from(bucket).upload(storagePath, blob, {
        upsert: true,
        contentType: typeof row.mime_type === 'string' && row.mime_type ? row.mime_type : blob.type || 'application/octet-stream',
      })
      if (error) throw error
      restoredFiles += 1
      restoredRows.push(restoredRow)
    } catch (error) {
      if (backup.sourceUserId === userId) restoredRows.push(restoredRow)
      else skippedFiles += 1
      const reason = error instanceof Error ? error.message : 'ссылка недоступна'
      warnings.push(`${String(row.name ?? `Файл №${index + 1}`)}: не удалось перенести содержимое (${reason}).`)
    }
  }

  const workers = Array.from({ length: Math.min(3, sourceRows.length) }, async () => {
    while (nextIndex < sourceRows.length) {
      const index = nextIndex
      nextIndex += 1
      await restoreOne(sourceRows[index], index)
      completedFiles += 1
      onProgress?.({ phase: 'files', label: 'Переносим загруженные файлы', completed: completedFiles, total: sourceRows.length })
    }
  })
  await Promise.all(workers)

  for (const batch of chunks(restoredRows, UPSERT_BATCH_SIZE)) {
    const { error } = await supabase.from('crm_files').upsert(batch)
    if (error) throw new Error(`crm_files: ${error.message}`)
  }

  return { restoredRows: restoredRows.length, restoredFiles, skippedFiles, warnings }
}

export const restoreWorkspaceBackup = async (
  input: WorkspaceBackup | string | unknown,
  userId: string,
  onProgress?: (progress: WorkspaceRestoreProgress) => void,
): Promise<WorkspaceRestoreResult> => {
  const backup = parseWorkspaceBackup(input)
  const online = await checkCloudConnection()
  if (!online) throw new Error('Для восстановления нужна связь с сервисом. Подключитесь к интернету и повторите попытку.')

  if (backup.profile) {
    const { error } = await supabase.from('profiles').upsert({ ...backup.profile, id: userId })
    if (error) throw new Error(`Профиль: ${error.message}`)
  }

  const skippedTables = [...SERVER_MANAGED_TABLES].filter(table => (backup.tables[table]?.length ?? 0) > 0)
  const totalRecordTables = RESTORE_TABLE_ORDER.filter(table => (backup.tables[table]?.length ?? 0) > 0).length
  let completedTables = 0
  let importedRows = 0

  for (const table of RESTORE_TABLE_ORDER) {
    const sourceRows = backup.tables[table] ?? []
    if (!sourceRows.length) continue
    const preparedRows = sourceRows.map(row => withCurrentUser(row, userId))
    for (const batch of chunks(preparedRows, UPSERT_BATCH_SIZE)) {
      const { error } = await supabase.from(table).upsert(batch)
      if (error) throw new Error(`${table}: ${error.message}`)
      importedRows += batch.length
    }
    completedTables += 1
    onProgress?.({ phase: 'records', label: `Восстанавливаем ${table}`, completed: completedTables, total: totalRecordTables })
  }

  const files = await restoreFileRecords(backup, userId, onProgress)
  importedRows += files.restoredRows
  onProgress?.({ phase: 'complete', label: 'Восстановление завершено', completed: 1, total: 1 })

  return {
    importedRows,
    restoredFiles: files.restoredFiles,
    skippedFiles: files.skippedFiles,
    skippedTables,
    warnings: [...backup.warnings, ...files.warnings],
  }
}
