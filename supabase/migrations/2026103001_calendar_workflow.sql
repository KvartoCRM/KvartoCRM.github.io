begin;
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
commit;
