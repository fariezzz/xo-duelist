-- Enforce single active browser session per account (cross-browser/device).

create table if not exists public.user_session_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holder_id text not null,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.user_session_locks enable row level security;

drop policy if exists "session_lock_select_own" on public.user_session_locks;
create policy "session_lock_select_own"
  on public.user_session_locks
  for select
  using (auth.uid() = user_id);

drop policy if exists "session_lock_insert_own" on public.user_session_locks;
create policy "session_lock_insert_own"
  on public.user_session_locks
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "session_lock_update_own" on public.user_session_locks;
create policy "session_lock_update_own"
  on public.user_session_locks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "session_lock_delete_own" on public.user_session_locks;
create policy "session_lock_delete_own"
  on public.user_session_locks
  for delete
  using (auth.uid() = user_id);

create or replace function public.claim_session_lock(
  input_holder_id text,
  input_ttl_seconds integer default 15
)
returns boolean
language plpgsql
security definer
as $$
declare
  uid uuid;
  current_lock public.user_session_locks%rowtype;
  ttl interval;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if input_holder_id is null or length(trim(input_holder_id)) = 0 then
    raise exception 'invalid_holder_id';
  end if;

  ttl := greatest(input_ttl_seconds, 1) * interval '1 second';

  loop
    select *
      into current_lock
    from public.user_session_locks
    where user_id = uid
    for update;

    if not found then
      begin
        insert into public.user_session_locks (user_id, holder_id, last_seen, created_at)
        values (uid, input_holder_id, now(), now());
        return true;
      exception
        when unique_violation then
          null;
      end;
    else
      if current_lock.holder_id = input_holder_id or current_lock.last_seen < (now() - ttl) then
        update public.user_session_locks
        set holder_id = input_holder_id, last_seen = now()
        where user_id = uid;
        return true;
      end if;

      return false;
    end if;
  end loop;
end;
$$;

create or replace function public.release_session_lock(input_holder_id text)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    return;
  end if;

  delete from public.user_session_locks
  where user_id = uid
    and holder_id = input_holder_id;
end;
$$;
