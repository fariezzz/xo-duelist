-- Allow matchmaking room creator to insert even when randomized as player2.
-- Existing policy only allowed auth.uid() = player1_id, which fails when
-- matchmaking assigns the creator as player2_id.

drop policy if exists "game_rooms_insert" on game_rooms;

create policy "game_rooms_insert" on game_rooms
  for insert
  with check (auth.uid() = player1_id or auth.uid() = player2_id);
