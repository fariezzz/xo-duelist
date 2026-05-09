-- Match history query optimization for player timeline lookups.
-- Helps queries that filter by player and order by played_at desc.

CREATE INDEX IF NOT EXISTS match_history_player1_played_at_desc_idx
  ON match_history (player1_id, played_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS match_history_player2_played_at_desc_idx
  ON match_history (player2_id, played_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS match_history_player1_match_type_played_at_desc_idx
  ON match_history (player1_id, match_type, played_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS match_history_player2_match_type_played_at_desc_idx
  ON match_history (player2_id, match_type, played_at DESC, id DESC);
