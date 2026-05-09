-- XO Duelist: turn-timeout strikes
-- First timeout skips the turn, second timeout loses the match.

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS player1_timeouts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player2_timeouts integer NOT NULL DEFAULT 0;
