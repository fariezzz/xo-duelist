-- Allow set_lobby_ready when room is waiting; only block if finished

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

  if room_record.status = 'finished' then
    raise exception 'room_finished';
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
