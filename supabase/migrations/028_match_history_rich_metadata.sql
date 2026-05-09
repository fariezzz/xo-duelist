-- Match history phase 2:
-- add richer lifecycle metadata for detail modal and analytics.

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS finish_reason text;

ALTER TABLE match_history
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS total_turns integer,
  ADD COLUMN IF NOT EXISTS finish_reason text;

UPDATE game_rooms
SET started_at = COALESCE(started_at, last_move_at, created_at, now())
WHERE started_at IS NULL
  AND status IN ('ongoing', 'finished');

UPDATE game_rooms
SET ended_at = COALESCE(ended_at, last_move_at, now())
WHERE status = 'finished'
  AND ended_at IS NULL;

CREATE OR REPLACE FUNCTION stamp_game_room_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ongoing' THEN
      NEW.started_at := COALESCE(NEW.started_at, NEW.last_move_at, now());
      NEW.ended_at := NULL;
    ELSIF NEW.status = 'finished' THEN
      NEW.started_at := COALESCE(NEW.started_at, NEW.last_move_at, now());
      NEW.ended_at := COALESCE(NEW.ended_at, NEW.last_move_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'waiting' THEN
    NEW.started_at := NULL;
    NEW.ended_at := NULL;
    NEW.finish_reason := NULL;
  ELSIF NEW.status = 'ongoing' AND OLD.status IS DISTINCT FROM 'ongoing' THEN
    NEW.started_at := COALESCE(NEW.started_at, NEW.last_move_at, now());
    NEW.ended_at := NULL;
    NEW.finish_reason := NULL;
  ELSIF NEW.status = 'finished' THEN
    NEW.started_at := COALESCE(NEW.started_at, OLD.started_at, NEW.last_move_at, now());
    NEW.ended_at := COALESCE(NEW.ended_at, NEW.last_move_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_game_room_timestamps ON game_rooms;

CREATE TRIGGER trg_stamp_game_room_timestamps
BEFORE INSERT OR UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION stamp_game_room_timestamps();

UPDATE match_history mh
SET
  started_at = COALESCE(mh.started_at, gr.started_at, gr.created_at),
  ended_at = COALESCE(mh.ended_at, gr.ended_at, gr.last_move_at),
  total_turns = COALESCE(mh.total_turns, gr.turn_count),
  finish_reason = COALESCE(mh.finish_reason, gr.finish_reason)
FROM game_rooms gr
WHERE gr.id = mh.room_id;

UPDATE match_history
SET duration_seconds = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (ended_at - started_at)))::integer)
WHERE duration_seconds IS NULL
  AND started_at IS NOT NULL
  AND ended_at IS NOT NULL;

CREATE OR REPLACE FUNCTION fill_match_history_board_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  room_row game_rooms%rowtype;
BEGIN
  IF NEW.board_snapshot IS NULL
     OR NEW.move_log IS NULL
     OR NEW.started_at IS NULL
     OR NEW.ended_at IS NULL
     OR NEW.total_turns IS NULL
     OR NEW.finish_reason IS NULL THEN
    SELECT *
    INTO room_row
    FROM game_rooms gr
    WHERE gr.id = NEW.room_id;

    IF FOUND THEN
      NEW.board_snapshot := COALESCE(NEW.board_snapshot, room_row.board_state);
      NEW.move_log := COALESCE(NEW.move_log, room_row.move_log);
      NEW.started_at := COALESCE(NEW.started_at, room_row.started_at, room_row.created_at);
      NEW.ended_at := COALESCE(NEW.ended_at, room_row.ended_at, room_row.last_move_at);
      NEW.total_turns := COALESCE(NEW.total_turns, room_row.turn_count);
      NEW.finish_reason := COALESCE(NEW.finish_reason, room_row.finish_reason);
    END IF;
  END IF;

  IF NEW.duration_seconds IS NULL
     AND NEW.started_at IS NOT NULL
     AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)))::integer
    );
  END IF;

  RETURN NEW;
END;
$$;
