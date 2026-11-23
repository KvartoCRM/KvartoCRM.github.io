import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
try{
await db.exec(`create table profiles(id uuid primary key,timezone text);create table tasks(id uuid primary key,user_id uuid,title text,due_date date,due_time time,status text default 'todo',is_completed boolean default false,deleted_at timestamptz,smart_criteria jsonb default '{}');create table notification_jobs(user_id uuid,source_type text,source_id uuid,preference_key text,reminder_minutes integer,due_at timestamptz,notify_at timestamptz,title text,body text,link text,status text,attempts integer,locked_at timestamptz,sent_at timestamptz,last_error text,unique(source_type,source_id,reminder_minutes));`);
const original=await fs.readFile('supabase/migrations/20260812_notification_scheduler.sql','utf8');
await db.exec(original.slice(original.indexOf('create or replace function public.cancel_notification_schedule'),original.indexOf('create or replace function public.enqueue_notification_schedule')));
const trigger=await fs.readFile('supabase/migrations/2026081902_trash_notification_fix.sql','utf8');await db.exec(trigger.slice(trigger.indexOf('create or replace function'),trigger.indexOf('create or replace function public.sync_event')));
await db.exec(await fs.readFile('supabase/migrations/2026112301_task_reminder_choices.sql','utf8'));
const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
await db.query(`insert into profiles values($1,'Europe/Moscow');`,[uid]);
await db.query(`insert into tasks(id,user_id,title,due_date,due_time) values($1,$2,'Task',current_date+10,'12:00')`,[id,uid]);
const pending=async()=> (await db.query("select reminder_minutes from notification_jobs where status='pending' order by reminder_minutes desc")).rows.map(r=>r.reminder_minutes);
assert.deepEqual(await pending(),[0]);
await db.query(`update tasks set smart_criteria='{"reminderOffsets":[1440,60,60,999,"5"]}' where id=$1`,[id]);assert.deepEqual(await pending(),[1440,60,0]);
await db.query(`update tasks set smart_criteria='{"reminderOffsets":[5]}' where id=$1`,[id]);assert.deepEqual(await pending(),[5,0]);
await db.query(`update tasks set smart_criteria='{"reminderOffsets":null}' where id=$1`,[id]);assert.deepEqual(await pending(),[0]);
await db.query(`update tasks set is_completed=true where id=$1`,[id]);assert.deepEqual(await pending(),[]);
await db.query(`update tasks set is_completed=false,smart_criteria='{"reminderOffsets":[60]}' where id=$1`,[id]);assert.deepEqual(await pending(),[60,0]);
await db.query(`update tasks set deleted_at=now() where id=$1`,[id]);assert.deepEqual(await pending(),[]);
await db.query(`update tasks set deleted_at=null,smart_criteria='{}' where id=$1`,[id]);
await db.query(`insert into notification_jobs(user_id,source_type,source_id,reminder_minutes,status,due_at) values($1,'task',$2,1440,'pending',now()+interval '10 days') on conflict(source_type,source_id,reminder_minutes) do update set status='pending'`,[uid,id]);
await db.exec(await fs.readFile('supabase/migrations/2026112301_task_reminder_choices.sql','utf8'));assert.deepEqual(await pending(),[0]);
console.log('REMINDER_DATABASE_PASS: default, multiple, invalid, replacement, completion, restore, trash');
}finally{await db.close()}
