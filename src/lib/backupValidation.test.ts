import test from 'node:test'
import assert from 'node:assert/strict'
import { validateBackupReferences } from './backupValidation.ts'
import { parseWorkspaceBackup } from './workspaceBackupFormat.ts'
const backup = (tables: unknown) => parseWorkspaceBackup({format:'kvartocrm-workspace-backup',version:1,exportedAt:'2026-11-02T00:00:00Z',sourceUserId:'user',tables})
test('backup preflight checks references independent of task order',()=>{
  assert.doesNotThrow(()=>validateBackupReferences(backup({tasks:[{id:'child',parent_task_id:'parent'},{id:'parent'}]})))
  assert.throws(()=>validateBackupReferences(backup({tasks:[{id:'child',parent_task_id:'missing'}]})),/tasks.parent_task_id/)
  assert.throws(()=>validateBackupReferences(backup({clients:[{id:'same'},{id:'same'}]})),/повторяются/)
  assert.throws(()=>validateBackupReferences(backup({crm_files:[{id:'file',property_id:'missing'}]})),/crm_files.property_id/)
})
