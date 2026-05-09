-- Match replay support:
-- 1) Persist move log snapshots in game_rooms
-- 2) Copy move log into match_history for replay

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS move_log jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE match_history
  ADD COLUMN IF NOT EXISTS move_log jsonb;

UPDATE game_rooms
SET move_log = '[]'::jsonb
WHERE move_log IS NULL;

UPDATE match_history mh
SET move_log = gr.move_log
FROM game_rooms gr
WHERE mh.move_log IS NULL
  AND gr.id = mh.room_id;

CREATE OR REPLACE FUNCTION append_game_room_move_log()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.move_log := COALESCE(NEW.move_log, '[]'::jsonb);
    RETURN NEW;
  END IF;

  -- Track board evolution while the match is live.
  -- OLD.status=ongoing keeps reset-to-lobby updates out of the replay log.
  IF OLD.status = 'ongoing'
     AND NEW.board_state IS DISTINCT FROM OLD.board_state THEN
    NEW.move_log := COALESCE(OLD.move_log, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'actor_id', OLD.current_turn,
        'turn_count', COALESCE(NEW.turn_count, 0),
        'played_at', COALESCE(NEW.last_move_at, now()),
        'board_state', NEW.board_state
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_append_game_room_move_log ON game_rooms;

CREATE TRIGGER trg_append_game_room_move_log
BEFORE INSERT OR UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION append_game_room_move_log();

-- Extend the existing match_history snapshot trigger to include move_log.
CREATE OR REPLACE FUNCTION fill_match_history_board_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.board_snapshot IS NULL OR NEW.move_log IS NULL THEN
    SELECT gr.board_state, gr.move_log
    INTO NEW.board_snapshot, NEW.move_log
    FROM game_rooms gr
    WHERE gr.id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;
