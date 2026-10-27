import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { prepareRestoreIdentity, restoreStoragePath } from './workspaceRestoreIdentity.ts'
import { parseWorkspaceBackup } from './workspaceBackupFormat.ts'

const source = '00000000-0000-4000-8000-000000000001'
const target = '00000000-0000-4000-8000-000000000002'
const client = '10000000-0000-4000-8000-000000000001'
const property = '20000000-0000-4000-8000-000000000001'
const file = '30000000-0000-4000-8000-000000000001'
const call = '40000000-0000-4000-8000-000000000001'
const fixture = () => parseWorkspaceBackup({ format: 'kvartocrm-workspace-backup', version: 1, exportedAt: '2026-10-23T10:00:00Z', sourceUserId: source, profile: { id: source, first_name: 'Source' }, tables: {
  clients: [{ id: client, user_id: source, first_name: 'Анна', last_name: '' }],
  properties: [{ id: property, user_id: source, owner_id: client }],
  property_details: [{ property_id: property, user_id: source }],
  crm_files: [{ id: file, user_id: source, client_id: client, property_id: property, storage_path: `${source}/photo.png` }],
  events: [{ id: call, user_id: source, related_client_id: client, external_key: `call-log:${call}`, notes: `kvartocrm-call-v1:${JSON.stringify({ metadata: { client_id: client }, notes: client })}` }],
  property_shares: [{ id: '50000000-0000-4000-8000-000000000001', user_id: source, property_id: property, slug: '60000000-0000-4000-8000-000000000001', active: true }],
}, fileUrls: { [file]: 'https://example.com/signed-file' } })

test('cross-account restore remaps relationships and calls, preserves input, and is repeatable', async () => {
  const original = fixture()
  const result = await prepareRestoreIdentity(original, target)
  assert.deepEqual(await prepareRestoreIdentity(original, target), result)
  assert.equal(await prepareRestoreIdentity(original, source), original)
  assert.notEqual(result.tables.clients[0].id, client)
  assert.equal(result.tables.properties[0].owner_id, result.tables.clients[0].id)
  assert.equal(result.tables.property_details[0].property_id, result.tables.properties[0].id)
  assert.equal(result.tables.crm_files[0].client_id, result.tables.clients[0].id)
  assert.equal(result.fileUrls[String(result.tables.crm_files[0].id)], original.fileUrls[file])
  assert.equal(result.tables.events[0].external_key, `call-log:${result.tables.events[0].id}`)
  const payload = JSON.parse(String(result.tables.events[0].notes).slice('kvartocrm-call-v1:'.length))
  assert.equal(payload.metadata.client_id, result.tables.clients[0].id)
  assert.equal(payload.notes, client, 'free text must not be rewritten')
  assert.equal(result.profile, null)
  assert.equal(result.tables.property_shares[0].active, false)
  assert.equal(original.tables.property_shares[0].active, true)
  assert.equal(restoreStoragePath(`${source}/photo.png`, source, target), `${target}/imported/${source}/photo.png`)
  assert.equal(restoreStoragePath(`${source}/photo.png`, source, source), `${source}/photo.png`)
  assert.notEqual((await prepareRestoreIdentity(original, 'another-account')).tables.clients[0].id, result.tables.clients[0].id)
})

test('remapped import survives tenant RLS and repeat upsert without modifying the source office', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role restore_user;
      create table clients(id uuid primary key, user_id uuid not null, first_name text, last_name text not null);
      alter table clients enable row level security;
      create policy own_rows on clients using(user_id = current_setting('app.user_id')::uuid) with check(user_id = current_setting('app.user_id')::uuid);
      grant select,insert,update on clients to restore_user;
      insert into clients values ('${client}','${source}','Анна','');
      set role restore_user; set app.user_id = '${target}';`)
    await assert.rejects(db.query('insert into clients values ($1,$2,$3,$4) on conflict(id) do update set user_id=excluded.user_id', [client, target, 'Анна', '']), /row-level security/)
    const result = await prepareRestoreIdentity(fixture(), target)
    const row = result.tables.clients[0]
    for (let attempt = 0; attempt < 2; attempt++) await db.query('insert into clients values ($1,$2,$3,$4) on conflict(id) do update set first_name=excluded.first_name', [row.id, target, row.first_name, row.last_name])
    assert.equal((await db.query('select * from clients')).rows.length, 1)
    await db.exec('reset role')
    const all = (await db.query<{user_id: string}>('select * from clients')).rows
    assert.equal(all.length, 2)
    assert.equal(all.filter(row => row.user_id === source).length, 1)
  } finally { await db.close() }
})
