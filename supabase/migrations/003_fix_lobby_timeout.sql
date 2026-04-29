-- Fix create_lobby_room() so it does not loop indefinitely and cause statement timeout.

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

  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

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
  returning game_rooms.id,
            game_rooms.room_code,
            game_rooms.player1_id,
            game_rooms.player2_id,
            game_rooms.board_state,
            game_rooms.current_turn,
            game_rooms.status,
            game_rooms.winner_id,
            game_rooms.player1_symbol,
            game_rooms.player2_symbol,
            game_rooms.last_move_at,
            game_rooms.created_at;
end;
$$;
