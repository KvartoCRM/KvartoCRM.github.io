import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const clientA = '10000000-0000-4000-8000-000000000001'
const clientB = '10000000-0000-4000-8000-000000000002'
const propertyA = '20000000-0000-4000-8000-000000000001'
const slug = '30000000-0000-4000-8000-000000000001'

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    create table public.profiles(id uuid primary key);
    create table public.clients(id uuid primary key, user_id uuid not null);
    create table public.properties(id uuid primary key, user_id uuid not null, owner_id uuid, deleted_at timestamptz);
    create table public.deals(id uuid primary key, user_id uuid not null, property_id uuid, buyer_id uuid);
    create table public.events(id uuid primary key, user_id uuid not null, related_client_id uuid, related_property_id uuid);
    create table public.tasks(id uuid primary key, user_id uuid not null, parent_task_id uuid);
    create table public.crm_files(id uuid primary key, user_id uuid not null, client_id uuid, property_id uuid, deal_id uuid, task_id uuid);
    create table public.crm_activities(id uuid primary key, user_id uuid not null, client_id uuid, property_id uuid);
    create table public.crm_imports(id uuid primary key, user_id uuid not null);
    create table public.crm_import_rows(id uuid primary key, user_id uuid not null, import_id uuid);
    create table public.documents(id uuid primary key, user_id uuid not null, property_id uuid, client_id uuid);
    create table public.property_shares(id uuid primary key, user_id uuid not null, property_id uuid, slug uuid unique not null, active boolean not null, snapshot jsonb not null);
    create table public.property_details(property_id uuid primary key, user_id uuid not null);
    create table public.client_requirements(id uuid primary key, user_id uuid not null, client_id uuid);
    create table public.property_owners(id uuid primary key, user_id uuid not null, property_id uuid, client_id uuid);
    create table public.property_history(id uuid primary key, user_id uuid not null, property_id uuid);
    create table public.deal_participants(id uuid primary key, user_id uuid not null, deal_id uuid, client_id uuid);
    create table public.client_contact_points(id uuid primary key, user_id uuid not null, client_id uuid);
    create table public.client_relationships(id uuid primary key, user_id uuid not null, source_client_id uuid, target_client_id uuid);
    create table storage.buckets(id text primary key, public boolean not null default false);
    alter table public.property_shares enable row level security;
    create policy "Anyone reads active property shares" on public.property_shares for select using (active);
    grant select on public.property_shares to anon, authenticated;
    create function public.enqueue_notification_schedule(uuid, text, uuid, text, text, text, text, timestamptz) returns void language sql as $$ select $$;
    create function public.cancel_notification_schedule(text, uuid) returns void language sql as $$ select $$;
    create function public.claim_due_notification_jobs(integer) returns integer language sql as $$ select 0 $$;
    create function public.handle_new_user() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public.sync_task_notification_jobs() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public.sync_event_notification_jobs() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public.sync_activity_notification_jobs() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public.purge_lumicrm_trash() returns void language sql security definer as $$ select $$;
    create function public.rls_auto_enable() returns void language sql security definer as $$ select $$;
  `)

  const migration = await readFile(new URL('../supabase/migrations/2026090701_security_boundaries.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  const eventTriggerMigration = await readFile(new URL('../supabase/migrations/2026090801_lock_rls_event_trigger.sql', import.meta.url), 'utf8')
  await db.exec(eventTriggerMigration)

  await db.query('insert into profiles(id) values ($1),($2)', [userA, userB])
  await db.query('insert into clients(id,user_id) values ($1,$2),($3,$4)', [clientA, userA, clientB, userB])
  // The quick-call batch must roll back its journal row if the linked follow-up
  // violates tenant ownership. Neither part may survive on its own.
  const callId = '40000000-0000-4000-8000-000000000001'
  const followupId = '40000000-0000-4000-8000-000000000002'
  await assert.rejects(() => db.query('insert into events(id,user_id,related_client_id) values ($1,$2,null),($3,$2,$4)', [callId,userA,followupId,clientB]), /Referenced record does not belong to this office/)
  assert.equal((await db.query('select id from events where id in ($1,$2)',[callId,followupId])).rows.length,0)
  await db.query('insert into events(id,user_id,related_client_id) values ($1,$2,null),($3,$2,$4)',[callId,userA,followupId,clientA])
  assert.equal((await db.query('select id from events where id in ($1,$2)',[callId,followupId])).rows.length,2)
  await assert.rejects(() => db.query('insert into events(id,user_id,related_client_id) values ($1,$2,null),($3,$2,$4)',[callId,userA,followupId,clientA]),/duplicate key/)
  await assert.rejects(
    () => db.query('insert into properties(id,user_id,owner_id) values ($1,$2,$3)', [propertyA, userA, clientB]),
    /Referenced record does not belong to this office/,
  )
  await db.query('insert into properties(id,user_id,owner_id) values ($1,$2,$3)', [propertyA, userA, clientA])
  await db.query(`insert into property_shares(id,user_id,property_id,slug,active,snapshot)
    values ('30000000-0000-4000-8000-000000000002',$1,$2,$3,true,$4)`, [userA, propertyA, slug, {
      address: 'Тестовый адрес', secret: 'не публиковать', contact: { name: 'Агент', passport: 'не публиковать' }, photos: [],
    }])
  const publicRows = await db.query('select snapshot from public.get_public_property_share($1)', [slug])
  assert.equal(publicRows.rows.length, 1)
  assert.equal(publicRows.rows[0].snapshot.address, 'Тестовый адрес')
  assert.equal(publicRows.rows[0].snapshot.secret, undefined)
  assert.equal(publicRows.rows[0].snapshot.contact.passport, undefined)

  const privileges = await db.query(`select
    has_function_privilege('authenticated', 'public.claim_due_notification_jobs(integer)', 'execute') as user_claim,
    has_function_privilege('service_role', 'public.claim_due_notification_jobs(integer)', 'execute') as service_claim,
    has_function_privilege('anon', 'public.purge_lumicrm_trash()', 'execute') as anon_purge,
    has_function_privilege('anon', 'public.rls_auto_enable()', 'execute') as anon_rls_helper,
    has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute') as user_rls_helper`)
  assert.deepEqual(privileges.rows[0], { user_claim: false, service_claim: true, anon_purge: false, anon_rls_helper: false, user_rls_helper: false })
  console.log('Security migration passed: tenant references, public-share allowlist, function privileges, event-trigger isolation')
} finally {
  await db.close()
}
