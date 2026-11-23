begin;
create or replace function public.save_quick_call(p_rows jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare r jsonb; found_rows jsonb; n integer; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2 then raise exception 'Invalid call batch'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'user_id')::uuid is distinct from uid or r->>'id' is null then raise exception 'Invalid owner'; end if;
  if r->>'external_key' not in ('call-log:'||(p_rows->0->>'id'),'follow-up:'||(p_rows->0->>'id')) then raise exception 'Invalid call key'; end if;
 end loop;
 if p_rows->0->>'external_key' <> 'call-log:'||(p_rows->0->>'id') or p_rows->0->>'notes' not like 'kvartocrm-call-v1:%' then raise exception 'Invalid call log'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':quick-call:'||(p_rows->0->>'id'),0));
 select count(*),coalesce(jsonb_agg(to_jsonb(e)),'[]') into n,found_rows from events e
 where e.user_id=uid and e.id in (select (value->>'id')::uuid from jsonb_array_elements(p_rows));
 if n=jsonb_array_length(p_rows) then return found_rows; end if;
 if n>0 then raise exception 'Some records already exist. Check saved call before creating another.'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  insert into events(id,user_id,type,title,event_date,event_time,is_completed,related_client_id,related_client_type,related_property_id,external_key,notes,time_zone,duration_minutes)
  values((r->>'id')::uuid,uid,r->>'type',r->>'title',(r->>'event_date')::date,(r->>'event_time')::time,(r->>'is_completed')::boolean,(r->>'related_client_id')::uuid,r->>'related_client_type',(r->>'related_property_id')::uuid,r->>'external_key',r->>'notes',r->>'time_zone',(r->>'duration_minutes')::integer);
 end loop;
 select jsonb_agg(to_jsonb(e)) into found_rows from events e where e.user_id=uid and e.id in (select (value->>'id')::uuid from jsonb_array_elements(p_rows));
 return found_rows;
end $$;
revoke all on function public.save_quick_call(jsonb) from public,anon;
grant execute on function public.save_quick_call(jsonb) to authenticated;
commit;
