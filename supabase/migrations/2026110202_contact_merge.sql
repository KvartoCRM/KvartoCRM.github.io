begin;
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
commit;
