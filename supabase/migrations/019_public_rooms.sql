-- Add public/private room support for lobby

-- 1. Add is_public column
ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- 2. RLS: allow any authenticated user to see public waiting rooms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'game_rooms_select_public' AND tablename = 'game_rooms'
  ) THEN
    CREATE POLICY "game_rooms_select_public" ON game_rooms
      FOR SELECT TO authenticated
      USING (is_public = true AND status = 'waiting');
  END IF;
END $$;

-- 3. Drop old parameterless overload so there's no ambiguity
DROP FUNCTION IF EXISTS create_lobby_room();

-- 4. Create the new create_lobby_room with is_public parameter
CREATE OR REPLACE FUNCTION create_lobby_room(input_is_public boolean DEFAULT false)
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
  created_at timestamptz,
  is_public boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  LOOP
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    BEGIN
      RETURN QUERY
      INSERT INTO game_rooms (
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
        created_at,
        is_public
      ) VALUES (
        new_code,
        auth.uid(),
        NULL,
        '[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
        auth.uid(),
        'waiting',
        NULL,
        'X',
        'O',
        now(),
        now(),
        COALESCE(input_is_public, false)
      )
      RETURNING
        game_rooms.id,
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
        game_rooms.created_at,
        game_rooms.is_public;

      -- Insert succeeded — exit the loop
      RETURN;
    EXCEPTION
      WHEN unique_violation THEN
        -- code collision, try another code
        NULL;
    END;
  END LOOP;
END;
$$;

-- 5. List public rooms with host username
CREATE OR REPLACE FUNCTION list_public_rooms()
RETURNS TABLE (
  id uuid,
  room_code text,
  player1_id uuid,
  host_username text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    gr.id,
    gr.room_code,
    gr.player1_id,
    p.username AS host_username,
    gr.created_at
  FROM game_rooms gr
  JOIN profiles p ON p.id = gr.player1_id
  WHERE gr.is_public = true
    AND gr.status = 'waiting'
    AND gr.player2_id IS NULL
    AND gr.player1_id <> auth.uid()
  ORDER BY gr.created_at DESC;
END;
$$;

-- 6. Join a public room by ID
CREATE OR REPLACE FUNCTION join_public_room(input_room_id uuid)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT *
    INTO room_record
  FROM game_rooms
  WHERE game_rooms.id = input_room_id
    AND game_rooms.is_public = true
    AND game_rooms.status = 'waiting'
    AND game_rooms.player2_id IS NULL
    AND game_rooms.player1_id <> auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found_or_full';
  END IF;

  UPDATE game_rooms
  SET
    player2_id = auth.uid(),
    last_move_at = now()
  WHERE game_rooms.id = room_record.id
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
