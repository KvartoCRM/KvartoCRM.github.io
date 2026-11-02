-- KvartoCRM: calendar, meeting results, buyer selections, reversible contact merge.
-- Apply in project flwsglkkarikekkopdbu. All four changes commit together.
-- If any statement fails, no part of this transaction is committed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(7112026, 1);
-- 2026103001_calendar_workflow.sql
alter table public.events
  add column if not exists duration_minutes integer,
  add column if not exists time_zone text,
  add column if not exists starts_at timestamptz,
  add column if not exists updated_at timestamptz default now();
alter table public.events add constraint events_duration_valid check (duration_minutes between 5 and 1440);

create or replace function public.prepare_event_schedule() returns trigger
language plpgsql set search_path = public as $$
begin
  new.time_zone := coalesce(new.time_zone, (select timezone from public.profiles where id=new.user_id), 'Europe/Moscow');
  if not exists (select 1 from pg_timezone_names where name=new.time_zone) then raise exception 'Unknown time zone'; end if;
  new.starts_at := case when new.event_time is null then null else (new.event_date+new.event_time) at time zone new.time_zone end;
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists events_prepare_schedule on public.events;
create trigger events_prepare_schedule before insert or update on public.events for each row execute function public.prepare_event_schedule();
update public.events set time_zone=coalesce(time_zone,(select timezone from public.profiles where id=events.user_id),'Europe/Moscow');

create or replace function public.sync_event_notification_jobs() returns trigger
language plpgsql security definer set search_path = public as $$
declare event_due_at timestamptz; preference text; kind_label text;
begin
  if tg_op='DELETE' then perform public.cancel_notification_schedule('event',old.id); return old; end if;
  if new.deleted_at is not null or new.event_time is null or new.is_completed then
    perform public.cancel_notification_schedule('event',new.id); return new;
  end if;
  event_due_at := new.starts_at;
  preference := case when new.type='call' then 'callReminders' else 'meetingReminders' end;
  kind_label := case when new.type='call' then 'Звонок' else 'Встреча' end;
  perform public.enqueue_notification_schedule(new.user_id,'event',new.id,preference,kind_label||': '||new.title,
    'Назначено на '||to_char(event_due_at at time zone new.time_zone,'DD.MM.YYYY HH24:MI')||' ('||new.time_zone||')','/work?view=calendar',event_due_at);
  return new;
end $$;
drop trigger if exists events_sync_notification_jobs on public.events;
create trigger events_sync_notification_jobs after insert or update of type,title,event_date,event_time,time_zone,is_completed,deleted_at or delete on public.events for each row execute function public.sync_event_notification_jobs();
alter table public.deals add column if not exists responsible_name text,
  add column if not exists next_action text,
  add column if not exists next_action_at timestamptz;

-- 2026103002_meeting_results.sql
create or replace function public.complete_meeting(p_event_id uuid,p_operation_id uuid,p_result text,p_reaction text,p_notes text,p_next_at timestamptz default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare source public.events; existing public.crm_activities; next_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into existing from public.crm_activities where id=p_operation_id and user_id=auth.uid();
  if found then
    if existing.metadata->>'event_id'<>p_event_id::text or existing.outcome<>p_result or coalesce(existing.notes,'')<>coalesce(p_notes,'') or coalesce(existing.metadata->>'reaction','')<>coalesce(p_reaction,'') or existing.due_at is distinct from p_next_at then raise exception 'Operation already saved with different data'; end if;
    return existing.id;
  end if;
  select * into source from public.events where id=p_event_id and user_id=auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Meeting not found'; end if;
  if source.is_completed then raise exception 'Meeting already completed'; end if;
  if source.type<>'meeting' or p_result not in ('Состоялся','Отменён','Не пришли') or length(coalesce(p_notes,''))>10000 then raise exception 'Invalid result'; end if;
  if p_next_at is not null and p_next_at<=now() then raise exception 'Next contact must be in the future'; end if;
  insert into public.crm_activities(id,user_id,client_id,property_id,type,status,title,occurred_at,outcome,notes,metadata,due_at,external_key)
  values(p_operation_id,auth.uid(),source.related_client_id,source.related_property_id,'meeting','completed','Итог: '||source.title,now(),p_result,p_notes,
    jsonb_build_object('kind','property_showing','event_id',source.id,'reaction',p_reaction,'visitor_name',source.title,'next_contact_at',p_next_at),p_next_at,'meeting-result:'||source.id);
  if p_next_at is not null then
    next_id:=gen_random_uuid();
    insert into public.events(id,user_id,type,title,event_date,event_time,time_zone,duration_minutes,related_client_id,related_client_type,external_key)
    values(next_id,auth.uid(),'call','После встречи: '||source.title,(p_next_at at time zone coalesce(source.time_zone,'Europe/Moscow'))::date,(p_next_at at time zone coalesce(source.time_zone,'Europe/Moscow'))::time,coalesce(source.time_zone,'Europe/Moscow'),15,source.related_client_id,source.related_client_type,'after-meeting:'||source.id);
  end if;
  update public.events set is_completed=true where id=source.id and user_id=auth.uid();
  return p_operation_id;
end $$;
revoke all on function public.complete_meeting(uuid,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.complete_meeting(uuid,uuid,text,text,text,timestamptz) to authenticated;

-- 2026110201_buyer_selections.sql
create table public.client_selections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 client_id uuid not null references public.clients(id), property_id uuid not null references public.properties(id),
 decision text not null default 'discuss' check(decision in ('fits','discuss','declined')),
 reason text not null default '' check(length(reason)<=2000),
 buyer_feedback text check(buyer_feedback in ('fits','discuss','declined')), buyer_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,client_id,property_id)
);
create table public.selection_shares (
 id uuid primary key, user_id uuid not null references public.profiles(id),client_id uuid not null references public.clients(id),
 slug uuid not null unique default gen_random_uuid(), snapshot jsonb not null, active boolean not null default true,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
alter table public.client_selections enable row level security;
alter table public.selection_shares enable row level security;
create policy own_selections on public.client_selections for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy own_selection_shares on public.selection_shares for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.client_selections,public.selection_shares from public,anon,authenticated;
grant select,insert,update,delete on public.client_selections,public.selection_shares to authenticated;
create function public.validate_client_selection() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.clients where id=new.client_id and user_id=new.user_id) or not exists(select 1 from public.properties where id=new.property_id and user_id=new.user_id) then raise exception 'Selection references another account';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger validate_client_selection before insert or update on public.client_selections for each row execute function public.validate_client_selection();
create function public.create_selection_share(p_id uuid,p_client_id uuid,p_days integer default 7) returns uuid language plpgsql security invoker set search_path=public as $$
declare result uuid; items jsonb;
begin
 if auth.uid() is null or p_days not between 1 and 7 then raise exception 'Invalid request';end if;
 select slug into result from public.selection_shares where id=p_id and user_id=auth.uid();if found then return result;end if;
 if not exists(select 1 from public.clients where id=p_client_id and user_id=auth.uid() and deleted_at is null) then raise exception 'Contact not found';end if;
 select jsonb_agg(jsonb_build_object('id',p.id,'address',p.address,'price',p.price,'rooms',p.rooms,'area',p.area,'floor',p.floor)) into items
 from public.properties p join public.client_selections s on s.property_id=p.id
 where s.user_id=auth.uid() and s.client_id=p_client_id and s.decision<>'declined' and p.user_id=auth.uid() and p.deleted_at is null;
 if items is null or jsonb_array_length(items)>50 then raise exception 'Choose between 1 and 50 properties';end if;
 insert into public.selection_shares(id,user_id,client_id,snapshot,expires_at) values(p_id,auth.uid(),p_client_id,items,now()+make_interval(days=>p_days)) returning slug into result;
 return result;
end $$;
create function public.read_selection_share(p_slug uuid) returns jsonb language sql security definer set search_path=public stable as $$
 select jsonb_build_object('properties',snapshot,'expiresAt',expires_at) from public.selection_shares where slug=p_slug and active and expires_at>now()
$$;
create function public.respond_selection_share(p_slug uuid,p_property_id uuid,p_decision text,p_reason text) returns boolean language plpgsql security definer set search_path=public as $$
declare share public.selection_shares;
begin
 if p_decision not in ('fits','discuss','declined') or length(coalesce(p_reason,''))>1000 then raise exception 'Invalid feedback';end if;
 select * into share from public.selection_shares where slug=p_slug and active and expires_at>now() for share;
 if not found or not exists(select 1 from jsonb_array_elements(share.snapshot) item where item->>'id'=p_property_id::text) then raise exception 'Link expired or property not included';end if;
 update public.client_selections set buyer_feedback=p_decision,buyer_reason=coalesce(p_reason,''),updated_at=clock_timestamp() where user_id=share.user_id and client_id=share.client_id and property_id=p_property_id;
 if not found then raise exception 'Selection no longer exists';end if;
 return true;
end $$;
revoke all on function public.create_selection_share(uuid,uuid,integer),public.read_selection_share(uuid),public.respond_selection_share(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_selection_share(uuid,uuid,integer) to authenticated;
grant execute on function public.read_selection_share(uuid),public.respond_selection_share(uuid,uuid,text,text) to anon,authenticated;

-- 2026110202_contact_merge.sql
alter table public.clients add column merged_into uuid references public.clients(id) on delete cascade;
create table public.contact_merge_log(id uuid primary key,user_id uuid not null references public.profiles(id),source_id uuid not null,target_id uuid not null,changes jsonb not null,created_at timestamptz not null default now(),undone_at timestamptz);
alter table public.contact_merge_log enable row level security;
create policy read_own_merges on public.contact_merge_log for select to authenticated using(user_id=auth.uid());
revoke all on public.contact_merge_log from public, anon, authenticated;
grant select on public.contact_merge_log to authenticated;

create function public.rewrite_contact_reference(value jsonb,source_id text,target_id text) returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb; item record; text_value text;
begin
 if jsonb_typeof(value)='object' then
  result:='{}';for item in select * from jsonb_each(value) loop
   result:=result||jsonb_build_object(item.key,case when item.key in ('id','user_id') then item.value else public.rewrite_contact_reference(item.value,source_id,target_id) end);
  end loop;return result;
 elsif jsonb_typeof(value)='array' then
  select coalesce(jsonb_agg(public.rewrite_contact_reference(v,source_id,target_id)),'[]') into result from jsonb_array_elements(value) v;return result;
 elsif jsonb_typeof(value)='string' then
  text_value:=value#>>'{}';if text_value=source_id then return to_jsonb(target_id);end if;
  if text_value like 'kvartocrm-call-v1:%' then
   return to_jsonb('kvartocrm-call-v1:'||public.rewrite_contact_reference(substring(text_value from 18)::jsonb,source_id,target_id)::text);
  end if;
 end if;return value;
end $$;

create function public.write_merge_row(table_name text,row_value jsonb) returns void language plpgsql set search_path=public as $$
declare columns_text text;
begin
 if table_name not in ('clients','properties','events','deals','crm_activities','crm_files','documents','client_requirements','property_owners','deal_participants','client_contact_points','client_relationships','client_selections','selection_shares','property_history') then raise exception 'Unsupported table';end if;
 select string_agg(format('%I',key),',') into columns_text from jsonb_object_keys(row_value) key;
 execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1))',table_name,table_name,columns_text,columns_text,table_name) using row_value;
end $$;
revoke all on function public.write_merge_row(text,jsonb),public.rewrite_contact_reference(jsonb,text,text) from public, anon, authenticated;

create function public.merge_contacts(p_id uuid,p_source uuid,p_target uuid,p_source_version timestamptz,p_target_version timestamptz) returns uuid language plpgsql security definer set search_path=public as $$
declare source public.clients; target public.clients; changes jsonb:='[]'; table_name text; item record; next_row jsonb; after_row jsonb; previous_row jsonb; point_id uuid; point_value text; point_kind text;
begin
 if auth.uid() is null or p_source=p_target then raise exception 'Invalid contact pair';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if exists(select 1 from public.contact_merge_log where id=p_id and user_id=auth.uid()) then
  if not exists(select 1 from public.contact_merge_log where id=p_id and user_id=auth.uid() and source_id=p_source and target_id=p_target) then raise exception 'Operation belongs to another pair';end if;
  return p_id;
 end if;
 select * into source from public.clients where id=p_source and user_id=auth.uid() and deleted_at is null and merged_into is null for update;
 if not found then raise exception 'Source unavailable';end if;
 select * into target from public.clients where id=p_target and user_id=auth.uid() and deleted_at is null and merged_into is null for update;
 if not found then raise exception 'Target unavailable';end if;
 if source.updated_at is distinct from p_source_version or target.updated_at is distinct from p_target_version then raise exception 'Contacts changed. Refresh preview.';end if;
 changes:=changes||jsonb_build_array(jsonb_build_object('table','clients','id',target.id,'before',to_jsonb(target)),jsonb_build_object('table','clients','id',source.id,'before',to_jsonb(source)));
 foreach table_name in array array['properties','events','deals','crm_activities','crm_files','documents','client_requirements','property_owners','deal_participants','client_contact_points','client_relationships','client_selections','selection_shares','property_history'] loop
  for item in execute format('select to_jsonb(t) value from public.%I t where user_id=$1 and to_jsonb(t)::text like $2 for update',table_name) using auth.uid(),'%'||p_source::text||'%' loop
   previous_row:=item.value;next_row:=public.rewrite_contact_reference(previous_row,p_source::text,p_target::text);
   if next_row=previous_row then continue;end if;
   changes:=changes||jsonb_build_array(jsonb_build_object('table',table_name,'id',previous_row->>'id','before',previous_row));
   if table_name='client_relationships' and next_row->>'source_client_id'=next_row->>'target_client_id' then
    delete from public.client_relationships where id=(previous_row->>'id')::uuid and user_id=auth.uid();
   else
    begin perform public.write_merge_row(table_name,next_row);
    exception when unique_violation then
     -- Primary contact wins for duplicate links/requirements; original retained in audit for undo.
     if table_name not in ('client_requirements','property_owners','deal_participants','client_contact_points','client_relationships','client_selections') then raise;end if;
     execute format('delete from public.%I where id=$1 and user_id=$2',table_name) using (previous_row->>'id')::uuid,auth.uid();
    end;
   end if;
  end loop;
 end loop;
 foreach point_kind in array array['phone','email'] loop
  point_value:=case when point_kind='phone' then source.phone else source.email end;
  if nullif(point_value,'') is not null and not exists(select 1 from public.client_contact_points where user_id=auth.uid() and client_id=p_target and kind=point_kind and value=point_value) then
   point_id:=gen_random_uuid();insert into public.client_contact_points(id,user_id,client_id,kind,value,label) values(point_id,auth.uid(),p_target,point_kind,point_value,'Из объединённого контакта');
   changes:=changes||jsonb_build_array(jsonb_build_object('table','client_contact_points','id',point_id,'before',null));
  end if;
 end loop;
 update public.clients set roles=array(select distinct unnest(coalesce(target.roles,'{}')||coalesce(source.roles,'{}'))),tags=array(select distinct unnest(coalesce(target.tags,'{}')||coalesce(source.tags,'{}'))),
  email=coalesce(nullif(target.email,''),source.email),phone=coalesce(nullif(target.phone,''),source.phone),
  description=concat_ws(E'\n\n',nullif(target.description,''),case when nullif(source.description,'') is not null then 'Из объединённого контакта: '||source.description end),updated_at=clock_timestamp() where id=p_target;
 update public.clients set merged_into=p_target,updated_at=clock_timestamp() where id=p_source;
 for item in select value,ordinality from jsonb_array_elements(changes) with ordinality loop
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2',item.value->>'table') into after_row using (item.value->>'id')::uuid,auth.uid();
  changes:=jsonb_set(changes,array[(item.ordinality-1)::text,'after'],coalesce(after_row,'null'));
 end loop;
 insert into public.contact_merge_log(id,user_id,source_id,target_id,changes) values(p_id,auth.uid(),p_source,p_target,changes);
 return p_id;
end $$;

create function public.undo_contact_merge(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare operation public.contact_merge_log; item jsonb; current_row jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 select * into operation from public.contact_merge_log where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Operation not found';end if;
 if operation.undone_at is not null then return true;end if;
 for item in select value from jsonb_array_elements(operation.changes) loop
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',item->>'table') into current_row using (item->>'id')::uuid,auth.uid();
  if coalesce(current_row,'null') is distinct from item->'after' then raise exception 'Affected records changed after merge. Automatic undo stopped to preserve later edits.';end if;
 end loop;
 for item in select value from jsonb_array_elements(operation.changes) where value->'before'='null'::jsonb loop
  execute format('delete from public.%I where id=$1 and user_id=$2',item->>'table') using (item->>'id')::uuid,auth.uid();
 end loop;
 for item in select value from jsonb_array_elements(operation.changes) where value->'before'<>'null'::jsonb loop
  perform public.write_merge_row(item->>'table',item->'before');
 end loop;
 update public.contact_merge_log set undone_at=clock_timestamp() where id=p_id;
 return true;
end $$;
revoke all on function public.merge_contacts(uuid,uuid,uuid,timestamptz,timestamptz),public.undo_contact_merge(uuid) from public, anon, authenticated;
grant execute on function public.merge_contacts(uuid,uuid,uuid,timestamptz,timestamptz),public.undo_contact_merge(uuid) to authenticated;
create function public.preview_contact_merge(p_source uuid,p_target uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare result jsonb:='{}'; table_name text; records jsonb;
begin
 if auth.uid() is null or p_source=p_target or (select count(*) from public.clients where id in(p_source,p_target) and user_id=auth.uid() and deleted_at is null and merged_into is null)<>2 then raise exception 'Contacts unavailable';end if;
 foreach table_name in array array['clients','properties','events','deals','crm_activities','crm_files','documents','client_requirements','property_owners','deal_participants','client_contact_points','client_relationships','client_selections'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from public.%I t where user_id=$1 and (to_jsonb(t)::text like $2 or to_jsonb(t)::text like $3)',table_name) into records using auth.uid(),'%'||p_source::text||'%','%'||p_target::text||'%';
  result:=result||jsonb_build_object(table_name,records);
 end loop;return result;
end $$;
revoke all on function public.preview_contact_merge(uuid,uuid) from public, anon, authenticated;
grant execute on function public.preview_contact_merge(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
select 'KVARTO_UPDATE_DATABASE_OK' as result;
