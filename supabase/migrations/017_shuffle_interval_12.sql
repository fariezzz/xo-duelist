-- Normalize shuffle interval to 12 turns.
-- This updates defaults and active rooms that still use the old 6-turn start.

alter table game_rooms
  alter column next_shuffle_at set default 12;

update game_rooms
set next_shuffle_at = 12
where coalesce(next_shuffle_at, 0) = 6
  and coalesce(turn_count, 0) < 12
  and status in ('waiting', 'ongoing');
