-- Adds room code based lobby support for XO Duelist

alter table game_rooms
  add column if not exists room_code text;

create unique index if not exists game_rooms_room_code_key on game_rooms (room_code);

update game_rooms
set room_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where room_code is null;

alter table game_rooms
  alter column room_code set not null;

-- Create a lobby room and return the created row.
create or replace function create_lobby_room()
returns table (
  id uuid,
  room_code text,
  player1_id uuid,
  player2_id uuid,
  board_state jsonb,
  current_turn uuid,
  status text,
  winner_id uuid,
  player1_symbol text,
  player2_symbol text,
  last_move_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  new_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  loop
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    begin
      return query
      insert into game_rooms (
        room_code,
        player1_id,
        player2_id,
        board_state,
        current_turn,
        status,
        winner_id,
        player1_symbol,
        player2_symbol,
        last_move_at,
        created_at
      ) values (
        new_code,
        auth.uid(),
        null,
        '[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
        auth.uid(),
        'waiting',
        null,
        'X',
        'O',
        now(),
        now()
      )
      returning game_rooms.id, game_rooms.room_code, game_rooms.player1_id, game_rooms.player2_id, game_rooms.board_state, game_rooms.current_turn, game_rooms.status, game_rooms.winner_id, game_rooms.player1_symbol, game_rooms.player2_symbol, game_rooms.last_move_at, game_rooms.created_at;
    exception
      when unique_violation then
        -- try another code
        null;
    end;
  end loop;
end;
$$;

-- Join a lobby room by code atomically and return the updated row.
create or replace function join_lobby_room(input_code text)
returns table (
  id uuid,
  room_code text,
  player1_id uuid,
  player2_id uuid,
  board_state jsonb,
  current_turn uuid,
  status text,
  winner_id uuid,
  player1_symbol text,
  player2_symbol text,
  last_move_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
as $$
declare
  room_record game_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
    into room_record
  from game_rooms
  where room_code = upper(trim(input_code))
    and status = 'waiting'
    and player2_id is null
    and player1_id <> auth.uid()
  for update;

  if not found then
    raise exception 'room_not_found_or_full';
  end if;

  update game_rooms
  set
    player2_id = auth.uid(),
    status = 'ongoing',
    last_move_at = now()
  where id = room_record.id
  returning * into room_record;

  return query
  select room_record.id,
         room_record.room_code,
         room_record.player1_id,
         room_record.player2_id,
         room_record.board_state,
         room_record.current_turn,
         room_record.status,
         room_record.winner_id,
         room_record.player1_symbol,
         room_record.player2_symbol,
         room_record.last_move_at,
         room_record.created_at;
end;
$$;

-- Cancel a lobby room if you are the host and the room is still waiting.
create or replace function cancel_lobby_room(input_room_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from game_rooms
  where id = input_room_id
    and player1_id = auth.uid()
    and status = 'waiting';

  if not found then
    raise exception 'cannot_cancel_room';
  end if;
end;
$$;
