-- Allow player2 (guest) to leave a waiting lobby room

CREATE OR REPLACE FUNCTION leave_lobby_room(input_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  room_record game_rooms%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO room_record
  FROM game_rooms
  WHERE game_rooms.id = input_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;

  IF room_record.status <> 'waiting' THEN
    RAISE EXCEPTION 'room_not_waiting';
  END IF;

  -- Only player2 can leave (player1 uses cancel_lobby_room)
  IF room_record.player2_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_guest';
  END IF;

  -- Remove player2 and reset their ready state
  UPDATE game_rooms
  SET player2_id = NULL,
      player2_ready = false
  WHERE game_rooms.id = input_room_id;
END;
$$;
