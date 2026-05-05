-- Add heartbeat support for lobby rooms to handle tab close gracefully.
-- Rooms are only cleaned up after 60 seconds of inactivity instead of immediately.

-- 1. Add heartbeat columns to game_rooms
ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS player1_last_heartbeat timestamptz,
  ADD COLUMN IF NOT EXISTS player2_last_heartbeat timestamptz;

-- Backfill existing rows
UPDATE game_rooms
SET player1_last_heartbeat = COALESCE(last_move_at, now()),
    player2_last_heartbeat = CASE WHEN player2_id IS NOT NULL THEN COALESCE(last_move_at, now()) ELSE NULL END
WHERE player1_last_heartbeat IS NULL;

-- 2. RPC: Send a heartbeat for a room (works for both player1 and player2)
CREATE OR REPLACE FUNCTION lobby_heartbeat(input_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid uuid;
  room_record game_rooms%rowtype;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO room_record
  FROM game_rooms
  WHERE id = input_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- Room already gone, no-op
  END IF;

  IF room_record.player1_id = uid THEN
    UPDATE game_rooms SET player1_last_heartbeat = now() WHERE id = input_room_id;
  ELSIF room_record.player2_id = uid THEN
    UPDATE game_rooms SET player2_last_heartbeat = now() WHERE id = input_room_id;
  END IF;
END;
$$;

-- 3. RPC: Cleanup stale rooms where the host has been gone for > input_timeout_seconds
--    - If player1 (host) heartbeat expired → delete the room
--    - If player2 (guest) heartbeat expired → remove player2 from the room
CREATE OR REPLACE FUNCTION cleanup_stale_lobby_rooms(input_timeout_seconds integer DEFAULT 60)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cutoff timestamptz;
BEGIN
  cutoff := now() - (input_timeout_seconds * interval '1 second');

  -- Remove guest from rooms where guest heartbeat expired
  UPDATE game_rooms
  SET player2_id = NULL,
      player2_ready = false,
      player2_last_heartbeat = NULL
  WHERE status = 'waiting'
    AND player2_id IS NOT NULL
    AND player2_last_heartbeat IS NOT NULL
    AND player2_last_heartbeat < cutoff;

  -- Delete rooms where host heartbeat expired
  DELETE FROM game_rooms
  WHERE status = 'waiting'
    AND player1_last_heartbeat IS NOT NULL
    AND player1_last_heartbeat < cutoff;
END;
$$;
