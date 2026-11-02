import type { WorkspaceBackup } from './workspaceBackupFormat.ts'
const references: Record<string, Record<string, string>> = {
  clients: { merged_into: 'clients' }, properties: { owner_id: 'clients' }, tasks: { parent_task_id: 'tasks' },
  events: { related_client_id: 'clients', related_property_id: 'properties' }, deals: { buyer_id: 'clients', property_id: 'properties' },
  deal_participants: { deal_id: 'deals', client_id: 'clients' }, property_owners: { property_id: 'properties', client_id: 'clients' },
  property_history: { property_id: 'properties' }, client_contact_points: { client_id: 'clients' },
  client_relationships: { source_client_id: 'clients', target_client_id: 'clients' },
  crm_activities: { client_id: 'clients', property_id: 'properties' }, crm_files: { client_id: 'clients', property_id: 'properties', deal_id: 'deals', task_id: 'tasks' },
  property_details: { property_id: 'properties' }, client_requirements: { client_id: 'clients' },
  property_shares: { property_id: 'properties' }, client_selections: { client_id: 'clients', property_id: 'properties' },
  selection_shares: { client_id: 'clients' }, crm_import_rows: { import_id: 'crm_imports' }, documents: { client_id: 'clients', property_id: 'properties' },
}
// Reject incomplete relationships before the first write, never silently detach them.
export function validateBackupReferences(backup: WorkspaceBackup) {
  const ids = new Map<string, Set<unknown>>()
  for (const [table, rows] of Object.entries(backup.tables)) {
    const key = table === 'property_details' ? 'property_id' : 'id'
    const values = new Set(rows.map(row => row[key]))
    if (values.has(undefined) || values.has(null) || values.size !== rows.length) throw new Error(`Раздел ${table}: отсутствуют или повторяются идентификаторы записей.`)
    ids.set(table, values)
  }
  for (const [table, fields] of Object.entries(references)) for (const [field, target] of Object.entries(fields)) {
    const missing = (backup.tables[table] || []).filter(row => row[field] != null && row[field] !== '' && !ids.get(target)?.has(row[field]))
    if (missing.length) throw new Error(`Копия неполная: ${table}.${field}, отсутствующих связей: ${missing.length}. Создайте новую полную копию в исходном аккаунте. Данные не записаны.`)
  }
}
