import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { prepareTaskRestore } from './workspaceRestoreIdentity.ts'
const user = '00000000-0000-4000-8000-000000000001'
const parent = '10000000-0000-4000-8000-000000000001'
const child = '10000000-0000-4000-8000-000000000002'
test('task restore handles child before parent with the production ownership trigger, including retries', async () => {
  const db = new PGlite()
  try {
    await db.exec('create table public.tasks(id uuid primary key,user_id uuid,parent_task_id uuid references public.tasks(id));')
    const migration = await readFile('supabase/migrations/2026090701_security_boundaries.sql', 'utf8')
    const definition = migration.match(/create or replace function public.lumicrm_validate_tenant_references\(\)[\s\S]*?\$\$;/)?.[0]
    assert.ok(definition)
    await db.exec(definition)
    await db.exec("create trigger tenant_check before insert or update on tasks for each row execute function public.lumicrm_validate_tenant_references('parent_task_id','tasks');")
    const rows = [{ id: child, user_id: user, parent_task_id: parent }, { id: parent, user_id: user, parent_task_id: null }]
    await assert.rejects(db.query('insert into tasks values($1,$2,$3)', [child,user,parent]), /Referenced record does not belong/)
    const plan = prepareTaskRestore(rows)
    for (let attempt=0;attempt<2;attempt++) {
      for (const row of plan.rows) await db.query('insert into tasks values($1,$2,$3) on conflict(id) do update set parent_task_id=excluded.parent_task_id', [row.id,row.user_id,row.parent_task_id])
      for (const link of plan.links) await db.query('update tasks set parent_task_id=$1 where id=$2 and user_id=$3', [link.parentId,link.id,user])
    }
    assert.equal((await db.query('select count(*)::int n from tasks')).rows[0].n,2)
    assert.equal((await db.query('select parent_task_id from tasks where id=$1',[child])).rows[0].parent_task_id,parent)
    assert.equal(rows[0].parent_task_id,parent)
  } finally { await db.close() }
})
test('incomplete task backup is rejected before writes', () => {
  assert.throws(() => prepareTaskRestore([{id:child,parent_task_id:parent}]), /отсутствует родительская задача/)
})
