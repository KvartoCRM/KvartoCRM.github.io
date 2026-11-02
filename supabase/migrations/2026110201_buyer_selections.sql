begin;
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
commit;
