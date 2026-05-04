-- Soft scoped session locks for gameplay areas (matchmaking/game),
-- with takeover support and lock-version bump on ownership change.

alter table public.user_session_locks
  add column if not exists scope text;

update public.user_session_locks
set scope = coalesce(scope, 'global');

alter table public.user_session_locks
  alter column scope set default 'global';

alter table public.user_session_locks
  alter column scope set not null;

alter table public.user_session_locks
  add column if not exists lock_version bigint not null default 1;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_session_locks_pkey'
      and conrelid = 'public.user_session_locks'::regclass
  ) then
    alter table public.user_session_locks drop constraint user_session_locks_pkey;
  end if;
exception
  when undefined_table then
    null;
end $$;

alter table public.user_session_locks
  add constraint user_session_locks_pkey primary key (user_id, scope);

create or replace function public.claim_scoped_session_lock(
  input_scope text,
  input_holder_id text,
  input_ttl_seconds integer default 15,
  input_force boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  uid uuid;
  current_lock public.user_session_locks%rowtype;
  ttl interval;
  normalized_scope text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if input_holder_id is null or length(trim(input_holder_id)) = 0 then
    raise exception 'invalid_holder_id';
  end if;

  normalized_scope := coalesce(nullif(trim(input_scope), ''), 'global');
  ttl := greatest(input_ttl_seconds, 1) * interval '1 second';

  loop
    select *
      into current_lock
    from public.user_session_locks
    where user_id = uid
      and scope = normalized_scope
    for update;

    if not found then
      begin
        insert into public.user_session_locks (user_id, scope, holder_id, last_seen, created_at, lock_version)
        values (uid, normalized_scope, input_holder_id, now(), now(), 1);
        return jsonb_build_object(
          'granted', true,
          'conflict', false,
          'holder_id', input_holder_id,
          'lock_version', 1
        );
      exception
        when unique_violation then
          null;
      end;
    else
      if current_lock.holder_id = input_holder_id then
        update public.user_session_locks
        set last_seen = now()
        where user_id = uid
          and scope = normalized_scope;
        return jsonb_build_object(
          'granted', true,
          'conflict', false,
          'holder_id', input_holder_id,
          'lock_version', current_lock.lock_version
        );
      end if;

      if input_force or current_lock.last_seen < (now() - ttl) then
        update public.user_session_locks
        set holder_id = input_holder_id,
            last_seen = now(),
            lock_version = current_lock.lock_version + 1
        where user_id = uid
          and scope = normalized_scope;
        return jsonb_build_object(
          'granted', true,
          'conflict', false,
          'holder_id', input_holder_id,
          'lock_version', current_lock.lock_version + 1
        );
      end if;

      return jsonb_build_object(
        'granted', false,
        'conflict', true,
        'holder_id', current_lock.holder_id,
        'lock_version', current_lock.lock_version
      );
    end if;
  end loop;
end;
$$;

create or replace function public.release_scoped_session_lock(
  input_scope text,
  input_holder_id text
)
returns void
language plpgsql
security definer
as $$
declare
  uid uuid;
  normalized_scope text;
begin
  uid := auth.uid();
  if uid is null then
    return;
  end if;

  normalized_scope := coalesce(nullif(trim(input_scope), ''), 'global');

  delete from public.user_session_locks
  where user_id = uid
    and scope = normalized_scope
    and holder_id = input_holder_id;
end;
$$;

create or replace function public.claim_session_lock(
  input_holder_id text,
  input_ttl_seconds integer default 15
)
returns boolean
language plpgsql
security definer
as $$
declare
  result jsonb;
begin
  result := public.claim_scoped_session_lock('global', input_holder_id, input_ttl_seconds, false);
  return coalesce((result ->> 'granted')::boolean, false);
end;
$$;

create or replace function public.release_session_lock(input_holder_id text)
returns void
language plpgsql
security definer
as $$
begin
  perform public.release_scoped_session_lock('global', input_holder_id);
end;
$$;
