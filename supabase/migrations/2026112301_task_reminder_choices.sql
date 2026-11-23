begin;
create or replace function public.enqueue_notification_schedule(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_preference_key text,
  p_title text,
  p_body text,
  p_link text,
  p_due_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder integer;
  offsets integer[] := array[1440,60,5,0];
  choices jsonb;
  reminder_at timestamptz;
begin
  perform public.cancel_notification_schedule(p_source_type, p_source_id);
  if p_due_at is null or p_due_at < now() - interval '90 seconds' then return; end if;

  if p_source_type = 'task' then
    select smart_criteria->'reminderOffsets' into choices from public.tasks where id=p_source_id and user_id=p_user_id;
    select array[0] || coalesce(array_agg(value::integer),array[]::integer[]) into offsets
    from (select distinct value from jsonb_array_elements(case when jsonb_typeof(choices)='array' then choices else '[]'::jsonb end) value where value in ('1440'::jsonb,'60'::jsonb,'5'::jsonb)) selected;
  end if;

  foreach reminder in array offsets
  loop
    reminder_at := p_due_at - make_interval(mins => reminder);
    if reminder_at >= now() - interval '90 seconds' then
      insert into public.notification_jobs (
        user_id, source_type, source_id, preference_key, reminder_minutes,
        due_at, notify_at, title, body, link, status, attempts, locked_at,
        sent_at, last_error
      ) values (
        p_user_id, p_source_type, p_source_id, p_preference_key, reminder,
        p_due_at, reminder_at, p_title, p_body, p_link, 'pending', 0, null,
        null, null
      )
      on conflict (source_type, source_id, reminder_minutes) do update set
        user_id = excluded.user_id,
        preference_key = excluded.preference_key,
        due_at = excluded.due_at,
        notify_at = excluded.notify_at,
        title = excluded.title,
        body = excluded.body,
        link = excluded.link,
        status = case when notification_jobs.status='sent' and notification_jobs.due_at=excluded.due_at then 'sent' else 'pending' end,
        attempts = 0,
        locked_at = null,
        sent_at = case when notification_jobs.status='sent' and notification_jobs.due_at=excluded.due_at then notification_jobs.sent_at else null end,
        last_error = null;
    end if;
  end loop;
end;
$$;


drop trigger if exists tasks_sync_notification_jobs on public.tasks;
create trigger tasks_sync_notification_jobs
 after insert or update of title,due_date,due_time,status,is_completed,deleted_at,smart_criteria or delete on public.tasks
 for each row execute function public.sync_task_notification_jobs();
-- Existing tasks have no optional choices: cancel their pending advance reminders.
update public.tasks set due_time=due_time
 where deleted_at is null and due_date is not null and due_time is not null
 and status <> 'done' and not is_completed;

commit;
