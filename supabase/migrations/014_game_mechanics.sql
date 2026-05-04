-- XO Duelist: Game Mechanics Migration
-- Adds columns for skills, curses, power cells, curse cells, and shuffle

ALTER TABLE game_rooms
  ADD COLUMN IF NOT EXISTS turn_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_shuffle_at integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS power_cells jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS curse_cells jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS player1_skill text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player2_skill text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player1_curse jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player2_curse jsonb DEFAULT NULL;
