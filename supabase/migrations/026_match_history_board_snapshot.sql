-- Match history enhancement: persist final board snapshot
-- and add indexes for history queries.

ALTER TABLE match_history
  ADD COLUMN IF NOT EXISTS board_snapshot jsonb;

CREATE INDEX IF NOT EXISTS match_history_played_at_desc_idx
  ON match_history (played_at DESC);

CREATE INDEX IF NOT EXISTS match_history_match_type_played_at_desc_idx
  ON match_history (match_type, played_at DESC);

-- Backfill existing history rows where room is still available.
UPDATE match_history mh
SET board_snapshot = gr.board_state
FROM game_rooms gr
WHERE mh.board_snapshot IS NULL
  AND gr.id = mh.room_id;

CREATE OR REPLACE FUNCTION fill_match_history_board_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.board_snapshot IS NULL THEN
    SELECT gr.board_state
    INTO NEW.board_snapshot
    FROM game_rooms gr
    WHERE gr.id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_match_history_board_snapshot ON match_history;

CREATE TRIGGER trg_fill_match_history_board_snapshot
BEFORE INSERT ON match_history
FOR EACH ROW
EXECUTE FUNCTION fill_match_history_board_snapshot();
