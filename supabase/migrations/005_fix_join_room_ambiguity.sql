-- Fix ambiguous room_code reference in join_lobby_room()

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
  normalized_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  normalized_code := upper(trim(input_code));

  select *
    into room_record
  from game_rooms
  where game_rooms.room_code = normalized_code
    and game_rooms.status = 'waiting'
    and game_rooms.player2_id is null
    and game_rooms.player1_id <> auth.uid()
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
