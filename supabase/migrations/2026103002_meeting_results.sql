begin;
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
commit;
