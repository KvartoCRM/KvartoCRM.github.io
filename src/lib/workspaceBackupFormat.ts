export const WORKSPACE_BACKUP_TABLES = [
  'clients',
  'properties',
  'tasks',
  'events',
  'deals',
  'deal_participants',
  'property_owners',
  'property_history',
  'client_contact_points',
  'client_relationships',
  'crm_activities',
  'crm_files',
  'property_details',
  'client_requirements',
  'monthly_plans',
  'property_shares',
  'notifications',
  'notification_jobs',
  'push_subscriptions',
  'crm_imports',
  'crm_import_rows',
  'documents',
] as const

export type WorkspaceBackupTable = typeof WORKSPACE_BACKUP_TABLES[number]
export type BackupRow = Record<string, unknown>

export const SERVER_MANAGED_WORKSPACE_TABLES: WorkspaceBackupTable[] = [
  'notifications',
  'notification_jobs',
  'push_subscriptions',
]

export type WorkspaceBackup = {
  format: 'kvartocrm-workspace-backup'
  version: 1
  exportedAt: string
  sourceUserId: string
  profile: BackupRow | null
  tables: Record<string, BackupRow[]>
  fileUrls: Record<string, string>
  warnings: string[]
}

export type WorkspaceBackupSummary = {
  exportedAt: string
  sourceUserId: string
  totalRows: number
  fileRecords: number
  tableCounts: Array<{ table: WorkspaceBackupTable; rows: number }>
  warnings: string[]
}

export type WorkspaceRestoreProgress = {
  phase: 'records' | 'files' | 'complete'
  label: string
  completed: number
  total: number
}

export type WorkspaceRestoreResult = {
  importedRows: number
  restoredFiles: number
  skippedFiles: number
  skippedTables: string[]
  warnings: string[]
}

const MAX_BACKUP_ROWS = 100_000
const isRecord = (value: unknown): value is BackupRow => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const parseWorkspaceBackup = (input: string | unknown): WorkspaceBackup => {
  let parsed: unknown = input
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input) as unknown
    } catch {
      throw new Error('Файл не является корректным JSON.')
    }
  }

  if (!isRecord(parsed) || !['kvartocrm-workspace-backup', 'lumicrm-workspace-backup'].includes(String(parsed.format))) {
    throw new Error('Это не резервная копия KvartoCRM.')
  }
  if (parsed.version !== 1) {
    throw new Error(`Версия резервной копии ${String(parsed.version ?? 'не указана')} пока не поддерживается.`)
  }
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) {
    throw new Error('В резервной копии отсутствует корректная дата создания.')
  }
  if (typeof parsed.sourceUserId !== 'string' || !parsed.sourceUserId) {
    throw new Error('В резервной копии отсутствует владелец данных.')
  }
  if (!isRecord(parsed.tables)) {
    throw new Error('В резервной копии отсутствует раздел с записями.')
  }

  const tables: Record<string, BackupRow[]> = {}
  let totalRows = 0
  for (const table of WORKSPACE_BACKUP_TABLES) {
    const rows = parsed.tables[table]
    if (rows === undefined) {
      tables[table] = []
      continue
    }
    if (!Array.isArray(rows) || rows.some(row => !isRecord(row))) {
      throw new Error(`Раздел ${table} повреждён или имеет неверный формат.`)
    }
    totalRows += rows.length
    if (totalRows > MAX_BACKUP_ROWS) {
      throw new Error(`В копии больше ${MAX_BACKUP_ROWS.toLocaleString('ru-RU')} записей. Импорт остановлен для безопасности.`)
    }
    tables[table] = rows as BackupRow[]
  }

  const rawFileUrls = isRecord(parsed.fileUrls) ? parsed.fileUrls : {}
  const fileUrls = Object.fromEntries(Object.entries(rawFileUrls).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string') : []

  return {
    format: 'kvartocrm-workspace-backup',
    version: 1,
    exportedAt: parsed.exportedAt,
    sourceUserId: parsed.sourceUserId,
    profile: isRecord(parsed.profile) ? parsed.profile : null,
    tables,
    fileUrls,
    warnings,
  }
}

export const summarizeWorkspaceBackup = (backup: WorkspaceBackup): WorkspaceBackupSummary => {
  const tableCounts = WORKSPACE_BACKUP_TABLES
    .map(table => ({ table, rows: backup.tables[table]?.length ?? 0 }))
    .filter(item => item.rows > 0)
  return {
    exportedAt: backup.exportedAt,
    sourceUserId: backup.sourceUserId,
    totalRows: tableCounts.reduce((total, item) => total + item.rows, 0),
    fileRecords: backup.tables.crm_files?.length ?? 0,
    tableCounts,
    warnings: [...backup.warnings],
  }
}
