begin;
create or replace function public.trash_history_entry(p_entry_id text) returns integer
language plpgsql security invoker set search_path=public as $$
declare kind text:=split_part(p_entry_id,':',1); target uuid:=split_part(p_entry_id,':',2)::uuid; event_id uuid; affected integer:=0; n integer; stamp timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if kind='call' then
  update events set deleted_at=stamp where id=target and user_id=auth.uid() and external_key like 'call-log:%' and deleted_at is null;
  get diagnostics n=row_count; affected:=affected+n;
  update crm_activities set deleted_at=stamp where id=target and user_id=auth.uid() and type='call' and deleted_at is null;
  get diagnostics n=row_count; affected:=affected+n;
 elsif kind='meeting-result' then
  select coalesce(metadata->>'event_id',nullif(replace(external_key,'meeting-result:',''),external_key))::uuid into event_id from crm_activities where id=target and user_id=auth.uid() and type='meeting';
  update crm_activities set deleted_at=stamp where id=target and user_id=auth.uid() and type='meeting' and deleted_at is null;
  get diagnostics n=row_count; affected:=affected+n;
  update events set deleted_at=stamp where id=event_id and user_id=auth.uid() and is_completed and deleted_at is null;
  get diagnostics n=row_count; affected:=affected+n;
 elsif kind='meeting' then
  update events set deleted_at=stamp where id=target and user_id=auth.uid() and is_completed and deleted_at is null;
  get diagnostics affected=row_count;
 update crm_activities set deleted_at=stamp where user_id=auth.uid() and type='meeting' and deleted_at is null and (metadata->>'event_id'=target::text or external_key='meeting-result:'||target);
  get diagnostics n=row_count; affected:=affected+n;
 elsif kind='task' then
  update tasks set deleted_at=stamp where id=target and user_id=auth.uid() and (is_completed or status='done') and deleted_at is null;
  get diagnostics affected=row_count;
 elsif kind='activity' then
  update crm_activities set deleted_at=stamp where id=target and user_id=auth.uid() and type in ('note','message') and deleted_at is null;
  get diagnostics affected=row_count;
 else raise exception 'Unknown history entry'; end if;
 return affected;
end $$;
revoke all on function public.trash_history_entry(text) from public,anon;
grant execute on function public.trash_history_entry(text) to authenticated;
commit;

