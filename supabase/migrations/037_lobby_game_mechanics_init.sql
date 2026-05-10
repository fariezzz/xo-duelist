-- Fix start_lobby_room to initialize game mechanics (power cells, curse cells,
-- turn_count, next_shuffle_at) when starting a lobby game.
-- Previously it only set status='ongoing' without these, causing lobby games
-- to have no power/curse cells and potentially incorrect shuffle timing.

CREATE OR REPLACE FUNCTION start_lobby_room(input_room_id uuid)
RETURNS TABLE (
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
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  room_record game_rooms%rowtype;
  picked_cells integer[];
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

  IF room_record.player1_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_host';
  END IF;

  IF room_record.player2_id IS NULL THEN
    RAISE EXCEPTION 'missing_player';
  END IF;

  IF NOT (room_record.player1_ready AND room_record.player2_ready) THEN
    RAISE EXCEPTION 'players_not_ready';
  END IF;

  -- Pick 4 distinct non-corner cells for power (2) + curse (2)
  -- Corners are indices 0, 4, 20, 24 on a 5x5 board
  SELECT array_agg(v)
  INTO picked_cells
  FROM (
    SELECT v
    FROM unnest(ARRAY[1,2,3,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,21,22,23]) AS v
    ORDER BY random()
    LIMIT 4
  ) s;

  UPDATE game_rooms
  SET status = 'ongoing',
      last_move_at = now(),
      turn_count = 0,
      next_shuffle_at = 12,
      power_cells = jsonb_build_array(
        jsonb_build_object('index', picked_cells[1], 'claimed', false),
        jsonb_build_object('index', picked_cells[2], 'claimed', false)
      ),
      curse_cells = jsonb_build_array(
        jsonb_build_object('index', picked_cells[3], 'triggered', false),
        jsonb_build_object('index', picked_cells[4], 'triggered', false)
      ),
      player1_skill = NULL,
      player2_skill = NULL,
      player1_curse = NULL,
      player2_curse = NULL
  WHERE game_rooms.id = input_room_id
  RETURNING * INTO room_record;

  RETURN QUERY
  SELECT room_record.id,
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
END;
$$;
