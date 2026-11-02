import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',foreign='10000000-0000-4000-8000-000000000003',property='20000000-0000-4000-8000-000000000001',event='30000000-0000-4000-8000-000000000001',op='40000000-0000-4000-8000-000000000001',meetingOp='40000000-0000-4000-8000-000000000002';
try{
await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;create function public.lumicrm_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp();return new;end $$;`);
await db.exec('alter default privileges in schema public grant all on tables to anon,authenticated;alter default privileges in schema public grant execute on functions to anon,authenticated;');
const base=await fs.readFile('supabase_schema.sql','utf8'),foundation=await fs.readFile('supabase/migrations/20260730_crm_foundation.sql','utf8');
for(const sql of [base,foundation])for(const match of sql.matchAll(/create table if not exists public\.[\s\S]*?\n\);/gi))await db.exec(match[0]);
for(const match of foundation.slice(0,foundation.indexOf('create unique index')).matchAll(/alter table public\.[\s\S]*?;/gi))await db.exec(match[0]);
for(const name of ['20260902_property_owners.sql','2026081903_deal_participants.sql','2026090202_property_history.sql']){const sql=await fs.readFile('supabase/migrations/'+name,'utf8');for(const match of sql.matchAll(/create table if not exists public\.[\s\S]*?\n\);/gi))await db.exec(match[0])}
await db.exec(`alter table public.profiles add column timezone text default 'Europe/Moscow';create function public.cancel_notification_schedule(text,uuid) returns void language sql as $$ select $$;create function public.enqueue_notification_schedule(uuid,text,uuid,text,text,text,text,timestamptz) returns void language sql as $$ select $$;`);
await db.exec(await fs.readFile('supabase/migrations/2026090203_v1_2_release_candidate.sql','utf8'));
const tableNames=(await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(r=>r.tablename);
for(const table of tableNames){await db.exec(`alter table public.${table} add column if not exists deleted_at timestamptz;alter table public.${table} add column if not exists updated_at timestamptz default now();`);if(table!=='profiles'){await db.exec(`alter table public.${table} enable row level security;create policy test_own on public.${table} for all using(user_id=auth.uid()) with check(user_id=auth.uid());grant all on public.${table} to authenticated`)}}
await db.exec('grant select on public.profiles to authenticated');
await db.exec(await fs.readFile('supabase/releases/20261102_update.sql','utf8'));console.log('APPLIED release bundle');
await db.exec(`insert into auth.users values('${uid}'),('${other}');insert into public.profiles(id,first_name,last_name) values('${uid}','A','A'),('${other}','B','B');insert into public.clients(id,user_id,type,first_name,last_name,phone) values('${a}','${uid}','buyer','Source','','89990000000'),('${b}','${uid}','buyer','Target','','+79990000000'),('${foreign}','${other}','buyer','Other','','+70000000000');insert into public.properties(id,user_id,address,owner_id) values('${property}','${uid}','Test address','${a}');insert into public.property_owners(user_id,property_id,client_id) values('${uid}','${property}','${a}'),('${uid}','${property}','${b}');insert into public.events(id,user_id,type,title,event_date,event_time,related_client_id,related_property_id) values('${event}','${uid}','meeting','Showing','2030-01-01','10:00','${a}','${property}');set role authenticated;set test.uid='${uid}';`);
assert.equal((await db.query(`select starts_at from events where id='${event}'`)).rows[0].starts_at.toISOString(),'2030-01-01T07:00:00.000Z');
await assert.rejects(()=>db.query(`select complete_meeting('${event}','${meetingOp}','Состоялся','','',now()-interval '1 hour')`));
assert.equal((await db.query(`select is_completed from events where id='${event}'`)).rows[0].is_completed,false);
await db.query(`select complete_meeting('${event}','${meetingOp}','Состоялся','Подходит','Test', '2030-01-02T12:00:00Z')`);
await db.query(`select complete_meeting('${event}','${meetingOp}','Состоялся','Подходит','Test', '2030-01-02T12:00:00Z')`);
assert.equal((await db.query('select count(*)::int n from events')).rows[0].n,2);
await db.query(`insert into client_selections(user_id,client_id,property_id) values('${uid}','${a}','${property}')`);
await assert.rejects(()=>db.query(`insert into client_selections(user_id,client_id,property_id) values('${uid}','${foreign}','${property}')`));
const share=(await db.query(`select create_selection_share('${op}','${a}',1) slug`)).rows[0].slug;
await db.exec('set role anon');const payload=(await db.query(`select read_selection_share('${share}') value`)).rows[0].value;assert.equal(payload.properties[0].address,'Test address');assert.equal(JSON.stringify(payload).includes('89990000000'),false);
await db.query(`select respond_selection_share('${share}','${property}','fits','Good')`);
await assert.rejects(()=>db.query(`select undo_contact_merge('${op}')`));await assert.rejects(()=>db.query('select * from client_selections'));
await db.exec(`set role authenticated;set test.uid='${uid}'`);await db.query(`update selection_shares set active=false where slug='${share}'`);assert.equal((await db.query(`select read_selection_share('${share}') value`)).rows[0].value,null);await assert.rejects(()=>db.query(`select respond_selection_share('${share}','${property}','fits','Bad')`));
await db.query(`select merge_contacts('${op}','${a}','${b}',(select updated_at from clients where id='${a}'),(select updated_at from clients where id='${b}'))`);
assert.equal((await db.query(`select owner_id from properties where id='${property}'`)).rows[0].owner_id,b);assert.equal((await db.query(`select count(*)::int n from property_owners`)).rows[0].n,1);
await db.query(`select merge_contacts('${op}','${a}','${b}',now(),now())`);
await db.query(`select undo_contact_merge('${op}')`);assert.equal((await db.query(`select owner_id from properties where id='${property}'`)).rows[0].owner_id,a);assert.equal((await db.query(`select count(*)::int n from property_owners`)).rows[0].n,2);
await db.exec(`set test.uid='${other}'`);await assert.rejects(()=>db.query(`select undo_contact_merge('${op}')`));await assert.rejects(()=>db.query(`select merge_contacts(gen_random_uuid(),'${a}','${foreign}',now(),now())`));
await assert.rejects(()=>db.query("insert into contact_merge_log(id,user_id,source_id,target_id,changes) values(gen_random_uuid(),auth.uid(),gen_random_uuid(),gen_random_uuid(),'[]')"));
await assert.rejects(()=>db.query("select write_merge_row('clients','{}')"));
await db.exec(`set test.uid='${uid}'`);
const secondOp=(await db.query(`select merge_contacts(gen_random_uuid(),'${a}','${b}',(select updated_at from clients where id='${a}'),(select updated_at from clients where id='${b}')) id`)).rows[0].id;
await db.query(`update clients set phone='+71111111111' where id='${b}'`);
await assert.rejects(()=>db.query('select undo_contact_merge($1)',[secondOp]),/changed after merge/);
assert.equal((await db.query(`select phone from clients where id='${b}'`)).rows[0].phone,'+71111111111');
console.log('UPDATE_DATABASE_PASS');
}catch(e){console.error(e.message,e.where||'',e.detail||'');process.exitCode=1}finally{await db.close()}
