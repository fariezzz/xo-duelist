-- Add ready state fields and RPCs for lobby start flow

alter table game_rooms
  add column if not exists player1_ready boolean not null default false,
  add column if not exists player2_ready boolean not null default false;

-- Set readiness for the current user in a lobby room.
create or replace function set_lobby_ready(input_room_id uuid, input_ready boolean)
returns void
language plpgsql
security definer
as $$
declare
  room_record game_rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into room_record
  from game_rooms
  where game_rooms.id = input_room_id;

  if not found then
    raise exception 'room_not_found';
  end if;

  if room_record.status <> 'waiting' then
    raise exception 'room_not_waiting';
  end if;

  if room_record.player1_id = auth.uid() then
    update game_rooms set player1_ready = input_ready where game_rooms.id = input_room_id;
  elsif room_record.player2_id = auth.uid() then
    update game_rooms set player2_ready = input_ready where game_rooms.id = input_room_id;
  else
    raise exception 'not_participant';
  end if;
end;
$$;

-- Start a lobby room when both players are ready and caller is host.
create or replace function start_lobby_room(input_room_id uuid)
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

  select * into room_record
  from game_rooms
  where game_rooms.id = input_room_id
  for update;

  if not found then
    raise exception 'room_not_found';
  end if;

  if room_record.player1_id <> auth.uid() then
    raise exception 'not_host';
  end if;

  if room_record.player2_id is null then
    raise exception 'missing_player';
  end if;

  if not (room_record.player1_ready and room_record.player2_ready) then
    raise exception 'players_not_ready';
  end if;

  update game_rooms
  set status = 'ongoing',
      last_move_at = now()
  where game_rooms.id = input_room_id
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
